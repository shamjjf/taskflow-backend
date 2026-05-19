import { Router } from 'express';
import { reportRecipientsController } from './reportRecipients.controller';
import { organizationSettingsController } from './organizationSettings.controller';
import { requireAuth } from '@/middleware/auth';
import { requireSuperAdmin } from '@/middleware/roleCheck';

const router = Router();

router.use(requireAuth);

// All settings routes are Super Admin only.
router.get('/organization', requireSuperAdmin, organizationSettingsController.get);
router.put('/organization', requireSuperAdmin, organizationSettingsController.update);

router.get('/report-recipients', requireSuperAdmin, reportRecipientsController.list);
router.post('/report-recipients', requireSuperAdmin, reportRecipientsController.create);
router.put('/report-recipients/:id', requireSuperAdmin, reportRecipientsController.update);
router.delete('/report-recipients/:id', requireSuperAdmin, reportRecipientsController.remove);

export default router;
