import { Router } from 'express';
import { tasksController } from './tasks.controller';
import { requireAuth } from '@/middleware/auth';
import { requireTLOrAbove } from '@/middleware/roleCheck';

const router = Router();

router.use(requireAuth);

router.get('/', tasksController.list);
router.get('/:id', tasksController.get);
router.get('/:id/comments', tasksController.listComments);

router.post('/', requireTLOrAbove, tasksController.create);
router.put('/:id', requireTLOrAbove, tasksController.update);
router.delete('/:id', requireTLOrAbove, tasksController.remove);

// Employees can start their own tasks and submit them for review
router.put('/:id/start', tasksController.start);
router.put('/:id/review', tasksController.review);

// Team leaders review the in_review queue: accept (/complete) or reject
router.put('/:id/complete', requireTLOrAbove, tasksController.complete);
router.put('/:id/reject', requireTLOrAbove, tasksController.reject);

router.post('/:id/comments', tasksController.addComment);
router.post('/:id/attachments', tasksController.addAttachment);

export default router;
