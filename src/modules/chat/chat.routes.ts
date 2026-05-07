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

// ============ DEPARTMENT GROUP CHAT ROUTES ============
router.get('/department/:departmentId/group-chat', chatController.getDepartmentGroupChat);
router.get('/:id/members', chatController.getDepartmentGroupMembers);
router.post('/:id/members/add', chatController.addMemberToDepartmentGroup);
router.post('/:id/members/remove', chatController.removeMemberFromDepartmentGroup);

export default router;
