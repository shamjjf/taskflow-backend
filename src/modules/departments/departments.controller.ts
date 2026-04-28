import { Request, Response } from 'express';
import { z } from 'zod';
import { departmentsService } from './departments.service';
import { ok, created, notFound } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';

const createSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  teamLeaderId: z.number().optional(),
});

const updateSchema = createSchema.partial();

const assignLeaderSchema = z.object({
  teamLeaderId: z.number(),
});

export const departmentsController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const depts = await departmentsService.list();
    return ok(res, depts);
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const dept = await departmentsService.getById(id);
    if (!dept) return notFound(res, 'Department not found');
    return ok(res, dept);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const data = createSchema.parse(req.body);
    const dept = await departmentsService.create(data);
    return created(res, dept, 'Department created');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const data = updateSchema.parse(req.body);
    const dept = await departmentsService.update(id, data);
    return ok(res, dept, 'Department updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    await departmentsService.delete(id);
    return ok(res, null, 'Department deleted');
  }),

  assignLeader: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const { teamLeaderId } = assignLeaderSchema.parse(req.body);
    const dept = await departmentsService.assignLeader(id, teamLeaderId);
    return ok(res, dept, 'Team leader assigned');
  }),

  members: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const members = await departmentsService.getMembers(id);
    return ok(res, members);
  }),
};
