import { Router } from 'express';
import { analyticsService } from './analytics.service';
import { requireAuth } from '@/middleware/auth';
import { requireAdminOrAbove } from '@/middleware/roleCheck';
import { asyncHandler } from '@/utils/asyncHandler';
import { ok, unauthorized } from '@/utils/response';

const router = Router();

router.use(requireAuth, requireAdminOrAbove);

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    if (!req.user) return unauthorized(res);
    const period = req.query.period as string | undefined;
    const stats = await analyticsService.dashboard(
      req.user.organizationId,
      period,
      req.user.role
    );
    return ok(res, stats);
  })
);

router.get(
  '/tasks-by-department',
  asyncHandler(async (req, res) => {
    if (!req.user) return unauthorized(res);
    const period = req.query.period as string | undefined;
    const data = await analyticsService.tasksByDepartment(
      req.user.organizationId,
      period,
      req.user.role
    );
    return ok(res, data);
  })
);

router.get(
  '/top-performers',
  asyncHandler(async (req, res) => {
    if (!req.user) return unauthorized(res);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;
    const period = req.query.period as string | undefined;
    const performers = await analyticsService.topPerformers(
      req.user.organizationId,
      limit,
      period
    );
    return ok(res, performers);
  })
);

export default router;
