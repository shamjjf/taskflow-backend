import { Router } from 'express';
import { activityService } from './activity.service';
import { requireAuth } from '@/middleware/auth';
import { requireSuperAdmin } from '@/middleware/roleCheck';
import { asyncHandler } from '@/utils/asyncHandler';
import { ok, unauthorized } from '@/utils/response';

const router = Router();

router.use(requireAuth, requireSuperAdmin);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!req.user) return unauthorized(res);
    const rawLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    // Clamp to a sane upper bound so `?limit=999999999` can't OOM the response.
    const limit = Math.min(Math.max(rawLimit, 1), 500);
    const logs = await activityService.list(req.user.organizationId, limit);
    return ok(res, logs);
  })
);

export default router;
