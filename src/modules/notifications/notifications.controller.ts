import { Request, Response } from 'express';
import { notificationsService } from './notifications.service';
import { ok, unauthorized } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';

export const notificationsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const notifications = await notificationsService.list(req.user.userId);
    return ok(res, notifications);
  }),

  unreadCount: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const count = await notificationsService.unreadCount(req.user.userId);
    return ok(res, { count });
  }),

  markRead: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const id = parseInt(req.params.id, 10);
    await notificationsService.markRead(id, req.user.userId);
    return ok(res, null, 'Marked as read');
  }),

  markAllRead: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    await notificationsService.markAllRead(req.user.userId);
    return ok(res, null, 'All marked as read');
  }),
};
