import { Router } from 'express';
import { organizationsController } from './organizations.controller';

const router = Router();

// Public endpoint — no auth, used by the login screen to populate the
// org picker. Only returns active orgs and exposes id/slug/name only.
router.get('/public', organizationsController.listPublic);

export default router;
