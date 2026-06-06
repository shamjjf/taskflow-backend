import { Request, Response } from 'express';
import { organizationsService } from './organizations.service';
import { ok } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';

export const organizationsController = {
  // GET /organizations/public  — used by the login dropdown.
  listPublic: asyncHandler(async (_req: Request, res: Response) => {
    const orgs = await organizationsService.listPublic();
    return ok(res, orgs);
  }),
};
