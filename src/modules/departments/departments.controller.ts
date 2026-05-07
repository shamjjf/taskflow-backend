import { Request, Response } from 'express';
import { z } from 'zod';
import { departmentsService } from './departments.service';
import { ok, created, notFound, forbidden } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';
import { departmentGroupChatSeeder } from '@/utils/departmentGroupChatSeeder';

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
