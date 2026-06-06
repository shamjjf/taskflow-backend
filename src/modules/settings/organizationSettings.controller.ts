import { Request, Response } from 'express';
import { z } from 'zod';
import { organizationSettingsService } from './organizationSettings.service';
import { ok, unauthorized } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';

const updateSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(150).optional(),
  timeZone: z.string().min(1).max(50).optional(),
});

export const organizationSettingsController = {
  get: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const settings = await organizationSettingsService.get(req.user.organizationId);
    return ok(res, settings);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const data = updateSchema.parse(req.body);
    const settings = await organizationSettingsService.update(
      req.user.organizationId,
      data
    );
    return ok(res, settings, 'Organization settings updated');
  }),
};
