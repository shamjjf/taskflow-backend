import { Request, Response } from 'express';
import { z } from 'zod';
import { organizationSettingsService } from './organizationSettings.service';
import { ok } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';

const updateSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(150).optional(),
  timeZone: z.string().min(1).max(50).optional(),
});

export const organizationSettingsController = {
  get: asyncHandler(async (_req: Request, res: Response) => {
    const settings = await organizationSettingsService.get();
    return ok(res, settings);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const data = updateSchema.parse(req.body);
    const settings = await organizationSettingsService.update(data);
    return ok(res, settings, 'Organization settings updated');
  }),
};
