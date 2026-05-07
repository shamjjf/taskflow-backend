import { prisma } from '@/config/prisma';
import { ConversationType, UserRole } from '@prisma/client';

export const chatService = {
  async listConversations(userId: number) {
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
    // Verify user is a participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
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
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: senderId } },
    });
    if (!participant) throw new Error('You are not a participant of this conversation');

    return prisma.message.create({
      data: { conversationId, senderId, message, attachmentUrl },
      include: {
        sender: { select: { id: true, name: true } },
      },
    });
  },

  async markRead(conversationId: number, userId: number) {
    return prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: new Date() },
    });
  },

  async canChatWith(
    requester: { userId: number; role: UserRole; departmentId: number | null },
    targetUserId: number
  ) {
    if (requester.role === 'super_admin') return true;

    // TL and Employee can only chat within their own department
    const target = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { departmentId: true },
    });

    if (!target) return false;
    return target.departmentId === requester.departmentId;
  },

  // ============ DEPARTMENT GROUP CHAT METHODS ============

  async createDepartmentGroupChat(departmentId: number, createdById: number) {
    // Get department with team leader
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      include: {
        teamLeader: { select: { id: true } },
      },
    });

    if (!department) throw new Error('Department not found');

    // Collect initial participants: creator, team leader
    const participantIds = new Set<number>();
    participantIds.add(createdById); // Creator (admin)
    if (department.teamLeaderId) {
      participantIds.add(department.teamLeaderId);
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

  async addMemberToDepartmentGroup(conversationId: number, userId: number) {
    // Verify conversation is a department group chat
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { isAutoDepartmentGroup: true, departmentId: true },
    });

    if (!conversation?.isAutoDepartmentGroup) {
      throw new Error('This is not a department group chat');
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

  async removeMemberFromDepartmentGroup(conversationId: number, userId: number) {
    // Verify conversation is a department group chat
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { isAutoDepartmentGroup: true },
    });

    if (!conversation?.isAutoDepartmentGroup) {
      throw new Error('This is not a department group chat');
    }

    // Remove the participant
    await prisma.conversationParticipant.delete({
      where: { conversationId_userId: { conversationId, userId } },
    });

    return { success: true };
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

