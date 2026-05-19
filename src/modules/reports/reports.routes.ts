import { Router } from 'express';
import { reportsController } from './reports.controller';
import { requireAuth } from '@/middleware/auth';

const router = Router();

// Public (signed-URL gated) — must be declared BEFORE requireAuth so it stays unauthenticated
router.get('/files/:filename', reportsController.serveReportFile);

router.use(requireAuth);

router.get('/', reportsController.list);
router.post('/jobs/daily-email/run', reportsController.triggerDailyReportEmail);
router.post('/jobs/weekly-email/run', reportsController.triggerWeeklyReportEmail);
router.get('/pending-approval', reportsController.pending);
router.get('/approved', reportsController.approvedForSuperAdmin);
router.get('/pending-admin-approval', reportsController.pendingForSuperAdmin);
router.get('/admin-all', reportsController.allAdminReports);
router.get('/:id', reportsController.get);

router.post('/', reportsController.create);

router.put('/:id/approve', reportsController.approve);
router.put('/:id/reject', reportsController.reject);
router.put('/:id/resubmit', reportsController.resubmit);

export default router;
