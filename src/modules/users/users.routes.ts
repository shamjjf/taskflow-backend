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
// Update / status / password: Team Leaders can edit employees in their own
// department; Admin/Super Admin have broader scope (controller enforces it).
router.put('/:id', requireTLOrAbove, usersController.update);
router.put('/:id/status', requireTLOrAbove, usersController.updateStatus);
router.put('/:id/password', requireTLOrAbove, usersController.setPassword);
// Delete remains admin-only.
router.delete('/:id', requireAdminOrAbove, usersController.remove);

export default router;
