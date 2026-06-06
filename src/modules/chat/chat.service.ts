import { prisma } from '@/config/prisma';
import { ConversationType, Prisma } from '@prisma/client';

export type CallEventOutcome = 'answered' | 'missed' | 'declined' | 'cancelled';

export interface CallEventData {
  callType: 'audio' | 'video';
  outcome: CallEventOutcome;
  callerId: number;
  channelName: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  isGroup: boolean;
  participantIds: number[];
}

async function ensureParticipant(conversationId: number, userId: number) {
  const existing = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (existing) return existing;

  // For auto-created department group chats, lazily add any user belonging
  // to that department so they can read & write without manual provisioning.
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { departmentId: true, isAutoDepartmentGroup: true },
  });
  if (!conversation?.isAutoDepartmentGroup || !conversation.departmentId) {
    return null;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { departmentId: true, role: true },
  });
  const isDepartmentMember = user?.departmentId === conversation.departmentId;
  const isPrivilegedAdmin = user?.role === 'super_admin' || user?.role === 'admin';
  if (!isDepartmentMember && !isPrivilegedAdmin) return null;

  return prisma.conversationParticipant.create({
    data: { conversationId, userId },
  });
}

export const chatService = {
  async listConversations(userId: number, organizationId: number) {
    // Auto-enroll the user into their department's auto group chat (if any) so
    // it shows up the first time they open chat after the feature is enabled.
    // Constrain the lookup to the user's org so we never auto-add a JJF user
    // into a 1xl group that happens to share a department name.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    if (user?.departmentId) {
      const deptGroup = await prisma.conversation.findFirst({
        where: {
          departmentId: user.departmentId,
          isAutoDepartmentGroup: true,
          organizationId,
        },
        select: { id: true },
      });
      if (deptGroup) {
        await prisma.conversationParticipant.upsert({
          where: { conversationId_userId: { conversationId: deptGroup.id, userId } },
          update: {},
          create: { conversationId: deptGroup.id, userId },
        });
      }
    }

    const convs = await prisma.conversation.findMany({
      where: {
        organizationId,
        participants: { some: { userId } },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, profileImage: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return convs;
  },

  async getMessages(conversationId: number, userId: number, organizationId: number) {
    // Cross-tenant fence: confirm the conversation actually belongs to the
    // caller's org before we even check participation. Returns the
    // generic "not a participant" error so id-probing yields no signal.
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { organizationId: true },
    });
    if (!conv || conv.organizationId !== organizationId) {
      throw new Error('You are not a participant of this conversation');
    }
    const participant = await ensureParticipant(conversationId, userId);
    if (!participant) throw new Error('You are not a participant of this conversation');

    return prisma.message.findMany({
      where: { conversationId },
      include: {
        sender: { select: { id: true, name: true, profileImage: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  async createConversation(data: {
    type: ConversationType;
    name?: string;
    participantIds: number[];
    createdById: number;
    departmentId?: number;
    organizationId: number;
  }) {
    // Ensure creator is in the participants list
    const allParticipantIds = Array.from(new Set([...data.participantIds, data.createdById]));

    // Defense in depth: confirm every participant actually belongs to this
    // org so a malicious caller can't sneak a cross-tenant DM into existence
    // by passing a foreign userId.
    const participants = await prisma.user.findMany({
      where: { id: { in: allParticipantIds } },
      select: { id: true, organizationId: true },
    });
    if (participants.length !== allParticipantIds.length) {
      throw new Error('One or more participants do not exist');
    }
    if (participants.some((p) => p.organizationId !== data.organizationId)) {
      throw new Error('Cannot create a conversation with users from another organization');
    }

    const conversationInclude = {
      participants: { include: { user: { select: { id: true, name: true } } } },
    } as const;

    // For direct (1:1) conversations, enforce a single room per pair of
    // users. Pair-uniqueness is guaranteed at the DB level by a unique
    // index on (direct_user_a_id, direct_user_b_id) — the canonical
    // (min, max) pair. Service logic here:
    //   1) compute the canonical pair,
    //   2) try findUnique to short-circuit the common case,
    //   3) attempt create, and
    //   4) on P2002 (unique-constraint violation from a racing creator),
    //      re-fetch and return the row the racer inserted.
    if (data.type === 'direct') {
      if (allParticipantIds.length !== 2) {
        throw new Error('Direct conversations must have exactly two participants');
      }
      const [directUserAId, directUserBId] = [...allParticipantIds].sort((x, y) => x - y);
      const pairWhere = {
        directUserAId_directUserBId: { directUserAId, directUserBId },
      };

      const existing = await prisma.conversation.findUnique({
        where: pairWhere,
        include: conversationInclude,
      });
      if (existing) return existing;

      try {
        return await prisma.conversation.create({
          data: {
            organizationId: data.organizationId,
            type: data.type,
            name: data.name,
            departmentId: data.departmentId,
            createdById: data.createdById,
            directUserAId,
            directUserBId,
            participants: {
              create: allParticipantIds.map((userId) => ({ userId })),
            },
          },
          include: conversationInclude,
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const raced = await prisma.conversation.findUnique({
            where: pairWhere,
            include: conversationInclude,
          });
          if (raced) return raced;
        }
        throw err;
      }
    }

    return prisma.conversation.create({
      data: {
        organizationId: data.organizationId,
        type: data.type,
        name: data.name,
        departmentId: data.departmentId,
        createdById: data.createdById,
        participants: {
          create: allParticipantIds.map((userId) => ({ userId })),
        },
      },
      include: conversationInclude,
    });
  },

  async sendMessage(conversationId: number, senderId: number, message: string, attachmentUrl?: string) {
    const participant = await ensureParticipant(conversationId, senderId);
    if (!participant) throw new Error('You are not a participant of this conversation');

    return prisma.message.create({
      data: { conversationId, senderId, message, attachmentUrl },
      include: {
        sender: { select: { id: true, name: true, profileImage: true } },
      },
    });
  },

  /**
   * Persist a call event as a chat message. The senderId is the caller — the
   * UI uses callEventData.callerId to decide whether to show the entry from
   * the caller's or the receiver's perspective (like WhatsApp).
   *
   * The text in `message` is a fallback label for clients that don't yet
   * understand `messageType === 'call_event'` (older builds, conversation
   * list previews, etc.).
   */
  async createCallEventMessage(conversationId: number, data: CallEventData) {
    const label = (() => {
      const isVideo = data.callType === 'video';
      switch (data.outcome) {
        case 'answered':
          return isVideo ? 'Video call' : 'Voice call';
        case 'missed':
          return isVideo ? 'Missed video call' : 'Missed voice call';
        case 'declined':
          return isVideo ? 'Declined video call' : 'Declined voice call';
        case 'cancelled':
          return isVideo ? 'Cancelled video call' : 'Cancelled voice call';
      }
    })();

    return prisma.message.create({
      data: {
        conversationId,
        senderId: data.callerId,
        message: label,
        messageType: 'call_event',
        callEventData: data as unknown as Prisma.InputJsonValue,
      },
      include: {
        sender: { select: { id: true, name: true, profileImage: true } },
      },
    });
  },

  async markRead(conversationId: number, userId: number) {
    const participant = await ensureParticipant(conversationId, userId);
    if (!participant) return null;
    return prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });
  },

  // ============ DEPARTMENT GROUP CHAT METHODS ============

  async createDepartmentGroupChat(departmentId: number, createdById: number) {
    // Get department with team leader and all members so the group chat
    // includes the entire department from day one.
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        teamLeader: { select: { id: true } },
        users: { select: { id: true } },
      },
    });

    if (!department) throw new Error('Department not found');

    // Collect initial participants: creator, team leader, all department members
    const participantIds = new Set<number>();
    participantIds.add(createdById);
    if (department.teamLeaderId) {
      participantIds.add(department.teamLeaderId);
    }
    for (const u of department.users) {
      participantIds.add(u.id);
    }

    // Create the group chat with isAutoDepartmentGroup flag.
    // The conversation inherits the department's organizationId so the
    // chat lives in the same tenant as the dept it represents.
    const conversation = await prisma.conversation.create({
      data: {
        organizationId: department.organizationId,
        type: 'group',
        name: `${department.name} - Group Chat`,
        departmentId,
        createdById,
        isAutoDepartmentGroup: true,
        participants: {
          create: Array.from(participantIds).map((userId) => ({ userId })),
        },
      },
      include: {
        participants: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    return conversation;
  },

  async addUserToDepartmentGroupIfMember(userId: number, departmentId: number) {
    const groupChat = await prisma.conversation.findFirst({
      where: { departmentId, isAutoDepartmentGroup: true },
      select: { id: true },
    });
    if (!groupChat) return null;
    return prisma.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId: groupChat.id, userId } },
      update: {},
      create: { conversationId: groupChat.id, userId },
    });
  },

  async getDepartmentGroupChat(departmentId: number) {
    return prisma.conversation.findFirst({
      where: {
        departmentId,
        isAutoDepartmentGroup: true,
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, profileImage: true } },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  },

  async getConversationById(conversationId: number) {
    return prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: { select: { userId: true } },
      },
    });
  },

  async addMember(conversationId: number, userId: number) {
    // Verify conversation is a group chat
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true },
    });

    if (!conversation || conversation.type !== 'group') {
      throw new Error('Members can only be added to group chats');
    }

    // Check if user is already a participant
    const existingParticipant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (existingParticipant) {
      throw new Error('User is already a member of this group');
    }

    // Add the user
    return prisma.conversationParticipant.create({
      data: { conversationId, userId },
      include: {
        user: { select: { id: true, name: true, email: true, profileImage: true } },
      },
    });
  },

  async removeMember(conversationId: number, userId: number) {
    // Verify conversation is a group chat
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true },
    });

    if (!conversation || conversation.type !== 'group') {
      throw new Error('Members can only be removed from group chats');
    }

    // Remove the participant
    await prisma.conversationParticipant.delete({
      where: { conversationId_userId: { conversationId, userId } },
    });

    return { success: true };
  },

  // Backwards-compatible aliases used elsewhere in the codebase
  async addMemberToDepartmentGroup(conversationId: number, userId: number) {
    return this.addMember(conversationId, userId);
  },

  async removeMemberFromDepartmentGroup(conversationId: number, userId: number) {
    return this.removeMember(conversationId, userId);
  },

  async getDepartmentGroupMembers(conversationId: number) {
    return prisma.conversationParticipant.findMany({
      where: { conversationId },
      include: {
        user: { select: { id: true, name: true, email: true, role: true, designation: true, profileImage: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
  },
};
