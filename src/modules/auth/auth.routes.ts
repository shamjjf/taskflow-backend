import { Router } from 'express';
import { authController } from './auth.controller';
import { requireAuth } from '@/middleware/auth';
import { requireSuperAdmin } from '@/middleware/roleCheck';

const router = Router();

router.post('/login', authController.login);
router.post('/refresh-token', authController.refresh);
router.post('/logout', requireAuth, authController.logout);
router.get('/me', requireAuth, authController.me);
router.post('/register', requireAuth, requireSuperAdmin, authController.register);

export default router;
