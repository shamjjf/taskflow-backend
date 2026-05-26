import { Router } from 'express';
import { departmentsController } from './departments.controller';
import { requireAuth } from '@/middleware/auth';
import { requireAdminOrAbove, requireSuperAdmin } from '@/middleware/roleCheck';

const router = Router();

router.use(requireAuth);

router.get('/', departmentsController.list);
router.get('/:id', departmentsController.get);
router.get('/:id/members', departmentsController.members);

// Sub-Admin and Super Admin can manage departments (create / edit / delete /
// reassign team leader). The backend service layer keeps the user.departmentId
// sync logic so a reassignment also pins the new TL to the right department.
router.post('/', requireAdminOrAbove, departmentsController.create);
router.put('/:id', requireAdminOrAbove, departmentsController.update);
router.delete('/:id', requireAdminOrAbove, departmentsController.remove);
router.put('/:id/assign-leader', requireAdminOrAbove, departmentsController.assignLeader);

// Group chat endpoints
router.post('/:id/group-chat/create', departmentsController.createGroupChatForDepartment);
router.post('/group-chats/seed', requireSuperAdmin, departmentsController.seedGroupChats);

export default router;
