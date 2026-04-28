import { Request, Response } from 'express';
import { z } from 'zod';
import { usersService } from './users.service';
import { ok, created, notFound, unauthorized } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';
import { UserRole } from '@prisma/client';

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['super_admin', 'team_leader', 'employee']),
  departmentId: z.number().optional(),
  designation: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().optional(),
  designation: z.string().optional(),
  phone: z.string().optional(),
  profileImage: z.string().optional(),
});

const statusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

export const usersController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const filters = {
      departmentId: req.query.departmentId ? parseInt(req.query.departmentId as string, 10) : undefined,
      role: req.query.role as UserRole | undefined,
      status: req.query.status as 'active' | 'inactive' | undefined,
    };
    const users = await usersService.list(filters, {
      role: req.user.role,
      departmentId: req.user.departmentId,
    });
    return ok(res, users);
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const user = await usersService.getById(id);
    if (!user) return notFound(res, 'User not found');
    return ok(res, user);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const data = createSchema.parse(req.body);
    const user = await usersService.create(data);
    return created(res, user, 'User created');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const data = updateSchema.parse(req.body);
    const user = await usersService.update(id, data);
    return ok(res, user, 'User updated');
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const { status } = statusSchema.parse(req.body);
    const user = await usersService.updateStatus(id, status);
    return ok(res, user, 'User status updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    await usersService.delete(id);
    return ok(res, null, 'User deleted');
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const user = await usersService.getById(req.user.userId);
    return ok(res, user);
  }),

  updateMe: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const data = updateSchema.parse(req.body);
    const user = await usersService.update(req.user.userId, data);
    return ok(res, user, 'Profile updated');
  }),
};
