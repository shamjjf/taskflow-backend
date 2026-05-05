import { Request, Response } from 'express';
import { z } from 'zod';
import { chatService } from './chat.service';
import { ok, created, unauthorized, badRequest, forbidden } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';
import { socketEvents } from '@/sockets';

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

export const chatController = {
  listConversations: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const convs = await chatService.listConversations(req.user.userId);
    return ok(res, convs);
  }),

  createConversation: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const data = createConvSchema.parse(req.body);

    // Verify TL/Employee can chat with each participant
    if (req.user.role !== 'super_admin') {
      for (const pid of data.participantIds) {
        const allowed = await chatService.canChatWith(
          { userId: req.user.userId, role: req.user.role, departmentId: req.user.departmentId },
          pid
        );
        if (!allowed) {
          return forbidden(res, 'You can only chat with members of your own department');
        }
      }
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
};
