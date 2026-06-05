import { Request, Response } from 'express';
import { z } from 'zod';
import { departmentsService } from './departments.service';
import { ok, created, notFound, forbidden, badRequest } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';
import { departmentGroupChatSeeder } from '@/utils/departmentGroupChatSeeder';

function handleTeamLeaderError(res: Response, err: unknown): Response | null {
  const msg = (err as Error)?.message || '';
  if (msg.includes('Admins and the Super Admin cannot be assigned')) {
    return forbidden(res, msg);
  }
  if (msg.includes('Selected team leader user not found')) {
    return badRequest(res, msg);
  }
  return null;
}

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
    try {
      const dept = await departmentsService.create(data);
      return created(res, dept, 'Department created');
    } catch (err) {
      const handled = handleTeamLeaderError(res, err);
      if (handled) return handled;
      throw err;
    }
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const data = updateSchema.parse(req.body);
    try {
      const dept = await departmentsService.update(id, data);
      return ok(res, dept, 'Department updated');
    } catch (err) {
      const handled = handleTeamLeaderError(res, err);
      if (handled) return handled;
      throw err;
    }
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    await departmentsService.delete(id);
    return ok(res, null, 'Department deleted');
  }),

  assignLeader: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const { teamLeaderId } = assignLeaderSchema.parse(req.body);
    try {
      const dept = await departmentsService.assignLeader(id, teamLeaderId);
      return ok(res, dept, 'Team leader assigned');
    } catch (err) {
      const handled = handleTeamLeaderError(res, err);
      if (handled) return handled;
      throw err;
    }
  }),

  members: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const members = await departmentsService.getMembers(id);
    return ok(res, members);
  }),

  seedGroupChats: asyncHandler(async (req: Request, res: Response) => {
    // Only super admins can seed group chats
    if (!req.user || req.user.role !== 'super_admin') {
      return forbidden(res, 'Only super admins can seed group chats');
    }

    const result = await departmentGroupChatSeeder.createGroupChatsForAllDepartments();
    return ok(res, result, 'Group chat seeding completed');
  }),

  createGroupChatForDepartment: asyncHandler(async (req: Request, res: Response) => {
    // Only super admins or team leads can create group chats
    if (!req.user || (req.user.role !== 'super_admin' && req.user.role !== 'admin')) {
      return forbidden(res, 'You do not have permission to create group chats');
    }

    const departmentId = parseInt(req.params.id, 10);
    const result = await departmentGroupChatSeeder.createGroupChatForDepartment(departmentId);

    if (!result.success) {
      return notFound(res, result.message);
    }

    return created(res, result.data, result.message);
  }),
};
