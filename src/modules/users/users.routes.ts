import { Router } from 'express';
import { usersController } from './users.controller';
import { requireAuth } from '@/middleware/auth';
import { requireAdminOrAbove, requireTLOrAbove } from '@/middleware/roleCheck';

const router = Router();

router.use(requireAuth);

router.get('/me/profile', usersController.me);
router.put('/me/profile', usersController.updateMe);

router.get('/', usersController.list);
router.get('/:id', usersController.get);

// Create: Team Leaders can add employees to their own department; Admin and
// Super Admin can create any user (controller enforces these constraints).
router.post('/', requireTLOrAbove, usersController.create);
// Admin and Super Admin (controller enforces role restrictions on targets)
router.put('/:id', requireAdminOrAbove, usersController.update);
router.put('/:id/status', requireAdminOrAbove, usersController.updateStatus);
router.put('/:id/password', requireAdminOrAbove, usersController.setPassword);
router.delete('/:id', requireAdminOrAbove, usersController.remove);

export default router;
