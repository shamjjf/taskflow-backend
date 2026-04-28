import { Router } from 'express';
import { activityService } from './activity.service';
import { requireAuth } from '@/middleware/auth';
import { requireSuperAdmin } from '@/middleware/roleCheck';
import { asyncHandler } from '@/utils/asyncHandler';
import { ok } from '@/utils/response';

const router = Router();

router.use(requireAuth, requireSuperAdmin);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const logs = await activityService.list(limit);
    return ok(res, logs);
  })
);

export default router;
