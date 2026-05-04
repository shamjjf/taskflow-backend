import { Router, Request, Response } from 'express';
import 'multer'; // Loads the Express.Multer namespace types globally
import { upload } from '@/middleware/upload';
import { requireAuth } from '@/middleware/auth';
import { ok, badRequest } from '@/utils/response';

const router = Router();

router.use(requireAuth);

// Extend Request to include the file property added by multer
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}



// POST /api/uploads - single file upload
router.post('/', upload.single('file'), (req: MulterRequest, res: Response) => {
  if (!req.file) {
    return badRequest(res, 'No file uploaded');
  }

  const fileUrl = `/uploads/${req.file.filename}`;

  return ok(
    res,
    {
      fileUrl,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
    },
    'File uploaded successfully'
  );
});

export default router;
