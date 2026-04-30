import { Router } from 'express';
import { agoraController } from './agora.controller';
import { requireAuth } from '@/middleware/auth';

const router = Router();

router.use(requireAuth);

router.post('/token', agoraController.generateToken);
router.post('/ring', agoraController.ring);
router.post('/accept', agoraController.accept);
router.post('/reject', agoraController.reject);
router.post('/end', agoraController.end);

export default router;
