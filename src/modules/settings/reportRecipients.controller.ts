import { Request, Response } from 'express';
import { z } from 'zod';
import { reportRecipientsService } from './reportRecipients.service';
import { ok, created, badRequest, notFound, unauthorized } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';
import { Prisma } from '@prisma/client';

const createSchema = z.object({
  email: z.string().email('Invalid email address').max(150),
  label: z.string().max(150).optional().nullable(),
});

const updateSchema = z.object({
  email: z.string().email('Invalid email address').max(150).optional(),
  label: z.string().max(150).optional().nullable(),
});

// Common helper: the service throws an object with `code: 'P2025'` when
// the recipient doesn't exist in the caller's org (either it never
// existed, or it belongs to another tenant). We treat both as 404 so
// id-probing across orgs reveals nothing.
function isP2025(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return true;
  }
  return (err as { code?: string })?.code === 'P2025';
}

export const reportRecipientsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const recipients = await reportRecipientsService.list(req.user.organizationId);
    return ok(res, recipients);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const data = createSchema.parse(req.body);
    try {
      const recipient = await reportRecipientsService.create(
        req.user.organizationId,
        data
      );
      return created(res, recipient, 'Report recipient added');
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return badRequest(res, 'That email is already in the recipient list');
      }
      throw err;
    }
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return badRequest(res, 'Invalid id');
    const data = updateSchema.parse(req.body);
    try {
      const recipient = await reportRecipientsService.update(
        id,
        req.user.organizationId,
        data
      );
      return ok(res, recipient, 'Report recipient updated');
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return badRequest(res, 'That email is already in the recipient list');
      }
      if (isP2025(err)) {
        return notFound(res, 'Report recipient not found');
      }
      throw err;
    }
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return badRequest(res, 'Invalid id');
    try {
      await reportRecipientsService.delete(id, req.user.organizationId);
      return ok(res, null, 'Report recipient removed');
    } catch (err) {
      if (isP2025(err)) {
        return notFound(res, 'Report recipient not found');
      }
      throw err;
    }
  }),
};
