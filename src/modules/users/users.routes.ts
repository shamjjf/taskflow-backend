import { Router } from 'express';
import { usersController } from './users.controller';
import { requireAuth } from '@/middleware/auth';
import { requireSuperAdmin } from '@/middleware/roleCheck';

const router = Router();

router.use(requireAuth);

router.get('/me/profile', usersController.me);
router.put('/me/profile', usersController.updateMe);

router.get('/', usersController.list);
router.get('/:id', usersController.get);

// Super Admin only
router.post('/', requireSuperAdmin, usersController.create);
router.put('/:id', requireSuperAdmin, usersController.update);
router.put('/:id/status', requireSuperAdmin, usersController.updateStatus);
router.delete('/:id', requireSuperAdmin, usersController.remove);

export default router;
