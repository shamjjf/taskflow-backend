import { prisma } from '@/config/prisma';
import { ConversationType } from '@prisma/client';

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
  async listConversations(userId: number) {
    // Auto-enroll the user into their department's auto group chat (if any) so
    // it shows up the first time they open chat after the feature is enabled.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    if (user?.departmentId) {
      const deptGroup = await prisma.conversation.findFirst({
        where: { departmentId: user.departmentId, isAutoDepartmentGroup: true },
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

  async getMessages(conversationId: number, userId: number) {
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
  }) {
    // Ensure creator is in the participants list
    const allParticipantIds = Array.from(new Set([...data.participantIds, data.createdById]));

    return prisma.conversation.create({
      data: {
        type: data.type,
        name: data.name,
        departmentId: data.departmentId,
        createdById: data.createdById,
        participants: {
          create: allParticipantIds.map((userId) => ({ userId })),
        },
      },
      include: {
        participants: { include: { user: { select: { id: true, name: true } } } },
      },
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

    // Create the group chat with isAutoDepartmentGroup flag
    const conversation = await prisma.conversation.create({
      data: {
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
