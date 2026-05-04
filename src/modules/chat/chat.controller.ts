import { Request, Response } from 'express';
import { z } from 'zod';
import { chatService } from './chat.service';
import { ok, created, unauthorized, badRequest } from '@/utils/response';
import { asyncHandler } from '@/middleware/errorHandler';
import { socketEvents } from '@/sockets';

const createConversationSchema = z.object({
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
  list: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const conversations = await chatService.listConversations(req.user.userId);
    return ok(res, conversations);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const data = createConversationSchema.parse(req.body);
    const conversation = await chatService.createConversation({
      ...data,
      createdById: req.user.userId,
    });
    return created(res, conversation);
  }),

  getMessages: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const conversationId = parseInt(req.params.id, 10);
    try {
      const messages = await chatService.getMessages(conversationId, req.user.userId);
      return ok(res, messages);
    } catch (err) {
      return badRequest(res, (err as Error).message);
    }
  }),

  sendMessage: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const conversationId = parseInt(req.params.id, 10);
    const { message, attachmentUrl } = messageSchema.parse(req.body);
    try {
      const msg = await chatService.sendMessage(
        conversationId,
        req.user.userId,
        message,
        attachmentUrl
      );

      // Real-time broadcast to all users in this conversation room
      try {
        socketEvents.newMessage(conversationId, msg);
      } catch (socketErr) {
        // Don't fail the request if socket emit fails — message is saved
        console.error('[Socket] Emit failed:', socketErr);
      }

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
