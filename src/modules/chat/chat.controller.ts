import { Request, Response } from 'express';
import { z } from 'zod';
import { chatService } from './chat.service';
import { ok, created, unauthorized, badRequest, forbidden } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';
import { socketEvents } from '@/sockets';
import { prisma } from '@/config/prisma';

const createConvSchema = z.object({
  type: z.enum(['direct', 'group']),
  name: z.string().optional(),
  participantIds: z.array(z.number()).min(1),
  departmentId: z.number().optional(),
});

const messageSchema = z.object({
  message: z.string().min(1),
  attachmentUrl: z.string().optional(),
});

async function canManageGroup(
  conversationId: number,
  user: { userId: number; role: string; departmentId: number | null }
) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { type: true, departmentId: true, createdById: true, isAutoDepartmentGroup: true },
  });
  if (!conv || conv.type !== 'group') return { ok: false, error: 'Not a group chat' };
  if (user.role === 'super_admin' || user.role === 'admin') return { ok: true };
  if (conv.createdById === user.userId) return { ok: true };
  if (
    user.role === 'team_leader' &&
    conv.departmentId &&
    conv.departmentId === user.departmentId
  ) {
    return { ok: true };
  }
  return { ok: false, error: 'You do not have permission to manage this group' };
}

export const chatController = {
  listConversations: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const convs = await chatService.listConversations(req.user.userId);
    return ok(res, convs);
  }),

  createConversation: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const data = createConvSchema.parse(req.body);

    if (data.type === 'group' && !data.name?.trim()) {
      return badRequest(res, 'Group name is required');
    }

    // Only team leaders and admins can create group chats; direct chats are
    // open to everyone (no per-participant department restriction).
    if (req.user.role === 'employee' && data.type === 'group') {
      return forbidden(res, 'Only team leaders or Sub-Admins can create group chats');
    }

    const conv = await chatService.createConversation({
      ...data,
      createdById: req.user.userId,
    });
    return created(res, conv, 'Conversation created');
  }),

  getMessages: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const conversationId = parseInt(req.params.id, 10);
    try {
      const messages = await chatService.getMessages(conversationId, req.user.userId);
      return ok(res, messages);
    } catch (err) {
      return forbidden(res, (err as Error).message);
    }
  }),

  sendMessage: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const conversationId = parseInt(req.params.id, 10);
    const { message, attachmentUrl } = messageSchema.parse(req.body);
    try {
      const msg = await chatService.sendMessage(conversationId, req.user.userId, message, attachmentUrl);

      // ============ REAL-TIME BROADCAST ============
      // Emit to all users in the conversation room so other participants get the message instantly
      try {
        socketEvents.newMessage(conversationId, { ...msg, conversationId });
      } catch (socketErr) {
        // Don't fail the request if socket emit fails — message is already saved
        console.error('[Socket] Failed to broadcast new message:', socketErr);
      }
      // =============================================

      return created(res, msg);
    } catch (err) {
      return badRequest(res, (err as Error).message);
    }
  }),

  markRead: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const conversationId = parseInt(req.params.id, 10);
    await chatService.markRead(conversationId, req.user.userId);
    return ok(res, null, 'Marked as read');
  }),

  // ============ DEPARTMENT GROUP CHAT ENDPOINTS ============

  getDepartmentGroupChat: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const departmentId = parseInt(req.params.departmentId, 10);

    try {
      const groupChat = await chatService.getDepartmentGroupChat(departmentId);
      if (!groupChat) {
        return badRequest(res, 'Department group chat not found');
      }

      return ok(res, groupChat);
    } catch (err) {
      return badRequest(res, (err as Error).message);
    }
  }),

  getDepartmentGroupMembers: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const conversationId = parseInt(req.params.id, 10);

    try {
      const members = await chatService.getDepartmentGroupMembers(conversationId);
      return ok(res, members);
    } catch (err) {
      return badRequest(res, (err as Error).message);
    }
  }),

  addMemberToDepartmentGroup: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const conversationId = parseInt(req.params.id, 10);
    const { userId } = z.object({ userId: z.number() }).parse(req.body);

    try {
      const auth = await canManageGroup(conversationId, {
        userId: req.user.userId,
        role: req.user.role,
        departmentId: req.user.departmentId,
      });
      if (!auth.ok) {
        return forbidden(res, auth.error || 'Forbidden');
      }

      const participant = await chatService.addMember(conversationId, userId);
      return created(res, participant, 'Member added to group');
    } catch (err) {
      return badRequest(res, (err as Error).message);
    }
  }),

  removeMemberFromDepartmentGroup: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const conversationId = parseInt(req.params.id, 10);
    const { userId } = z.object({ userId: z.number() }).parse(req.body);

    try {
      const auth = await canManageGroup(conversationId, {
        userId: req.user.userId,
        role: req.user.role,
        departmentId: req.user.departmentId,
      });
      if (!auth.ok) {
        return forbidden(res, auth.error || 'Forbidden');
      }

      const result = await chatService.removeMember(conversationId, userId);
      return ok(res, result, 'Member removed from group');
    } catch (err) {
      return badRequest(res, (err as Error).message);
    }
  }),
};
