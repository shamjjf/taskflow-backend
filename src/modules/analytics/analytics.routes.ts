import { Router } from 'express';
import { analyticsService } from './analytics.service';
import { requireAuth } from '@/middleware/auth';
import { requireSuperAdmin } from '@/middleware/roleCheck';
import { asyncHandler } from '@/utils/asyncHandler';
import { ok } from '@/utils/response';

const router = Router();

router.use(requireAuth, requireSuperAdmin);

router.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const stats = await analyticsService.dashboard();
    return ok(res, stats);
  })
);

router.get(
  '/tasks-by-department',
  asyncHandler(async (_req, res) => {
    const data = await analyticsService.tasksByDepartment();
    return ok(res, data);
  })
);

router.get(
  '/top-performers',
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;
    const performers = await analyticsService.topPerformers(limit);
    return ok(res, performers);
  })
);

export default router;
