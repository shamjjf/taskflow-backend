import { Router } from 'express';
import { reportsController } from './reports.controller';
import { requireAuth } from '@/middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', reportsController.list);
router.get('/pending-approval', reportsController.pending);
router.get('/approved', reportsController.approvedForSuperAdmin);
router.get('/:id', reportsController.get);

router.post('/', reportsController.create);

router.put('/:id/approve', reportsController.approve);
router.put('/:id/reject', reportsController.reject);
router.put('/:id/resubmit', reportsController.resubmit);

export default router;
