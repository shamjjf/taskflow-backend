import { Request, Response } from 'express';
import { z } from 'zod';
import { reportRecipientsService } from './reportRecipients.service';
import { ok, created, badRequest, notFound } from '@/utils/response';
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

export const reportRecipientsController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const recipients = await reportRecipientsService.list();
    return ok(res, recipients);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const data = createSchema.parse(req.body);
    try {
      const recipient = await reportRecipientsService.create(data);
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
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return badRequest(res, 'Invalid id');
    const data = updateSchema.parse(req.body);
    try {
      const recipient = await reportRecipientsService.update(id, data);
      return ok(res, recipient, 'Report recipient updated');
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          return badRequest(res, 'That email is already in the recipient list');
        }
        if (err.code === 'P2025') {
          return notFound(res, 'Report recipient not found');
        }
      }
      throw err;
    }
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return badRequest(res, 'Invalid id');
    try {
      await reportRecipientsService.delete(id);
      return ok(res, null, 'Report recipient removed');
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        return notFound(res, 'Report recipient not found');
      }
      throw err;
    }
  }),
};
