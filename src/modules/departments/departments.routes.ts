import { Router } from 'express';
import { departmentsController } from './departments.controller';
import { requireAuth } from '@/middleware/auth';
import { requireSuperAdmin } from '@/middleware/roleCheck';

const router = Router();

router.use(requireAuth);

router.get('/', departmentsController.list);
router.get('/:id', departmentsController.get);
router.get('/:id/members', departmentsController.members);

// Super Admin only
router.post('/', requireSuperAdmin, departmentsController.create);
router.put('/:id', requireSuperAdmin, departmentsController.update);
router.delete('/:id', requireSuperAdmin, departmentsController.remove);
router.put('/:id/assign-leader', requireSuperAdmin, departmentsController.assignLeader);

// Group chat endpoints
router.post('/:id/group-chat/create', departmentsController.createGroupChatForDepartment);
router.post('/group-chats/seed', requireSuperAdmin, departmentsController.seedGroupChats);

export default router;
