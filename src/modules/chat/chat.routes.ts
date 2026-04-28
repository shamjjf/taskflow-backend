import { Router } from 'express';
import { chatController } from './chat.controller';
import { requireAuth } from '@/middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', chatController.listConversations);
router.post('/', chatController.createConversation);
router.get('/:id/messages', chatController.getMessages);
router.post('/:id/messages', chatController.sendMessage);
router.put('/:id/read', chatController.markRead);

export default router;
