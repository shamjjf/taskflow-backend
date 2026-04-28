import { Router } from 'express';
import { notificationsController } from './notifications.controller';
import { requireAuth } from '@/middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', notificationsController.list);
router.get('/unread-count', notificationsController.unreadCount);
router.put('/:id/read', notificationsController.markRead);
router.put('/read-all', notificationsController.markAllRead);

export default router;
