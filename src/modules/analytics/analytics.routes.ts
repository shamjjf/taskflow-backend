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
  asyncHandler(async (req, res) => {
    const period = req.query.period as string | undefined;
    const stats = await analyticsService.dashboard(period);
    return ok(res, stats);
  })
);

router.get(
  '/tasks-by-department',
  asyncHandler(async (req, res) => {
    const period = req.query.period as string | undefined;
    const data = await analyticsService.tasksByDepartment(period);
    return ok(res, data);
  })
);

router.get(
  '/top-performers',
  asyncHandler(async (req, res) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;
    const period = req.query.period as string | undefined;
    const performers = await analyticsService.topPerformers(limit, period);
    return ok(res, performers);
  })
);

export default router;
