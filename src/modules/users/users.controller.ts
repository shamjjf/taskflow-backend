import { Request, Response } from 'express';
import { z } from 'zod';
import { usersService } from './users.service';
import { ok, created, notFound, unauthorized, forbidden } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';
import { UserRole } from '@prisma/client';

const createSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['super_admin', 'admin', 'team_leader', 'employee']),
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

const PROTECTED_ROLES: UserRole[] = ['admin', 'super_admin'];

async function ensureAdminCanTouchTarget(
  req: Request,
  res: Response,
  targetId: number
): Promise<boolean> {
  if (!req.user) {
    unauthorized(res);
    return false;
  }
  if (req.user.role === 'super_admin') return true;
  const target = await usersService.getById(targetId);
  if (!target) {
    notFound(res, 'User not found');
    return false;
  }
  if (PROTECTED_ROLES.includes(target.role)) {
    forbidden(res, 'Admins cannot view or modify other admins or the super admin');
    return false;
  }
  return true;
}

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
    if (!req.user) return unauthorized(res);
    const id = parseInt(req.params.id, 10);
    const user = await usersService.getById(id);
    if (!user) return notFound(res, 'User not found');
    if (req.user.role === 'admin' && PROTECTED_ROLES.includes(user.role) && user.id !== req.user.userId) {
      return forbidden(res, 'Admins cannot view other admins or the super admin');
    }
    return ok(res, user);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const data = createSchema.parse(req.body);
    if (req.user.role !== 'super_admin' && PROTECTED_ROLES.includes(data.role)) {
      return forbidden(res, 'Only the super admin can create admin or super admin users');
    }
    const payload = data.role === 'admin' ? { ...data, departmentId: undefined } : data;
    const user = await usersService.create(payload);
    return created(res, user, 'User created');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (!(await ensureAdminCanTouchTarget(req, res, id))) return;
    const data = updateSchema.parse(req.body);
    const user = await usersService.update(id, data);
    return ok(res, user, 'User updated');
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (!(await ensureAdminCanTouchTarget(req, res, id))) return;
    const { status } = statusSchema.parse(req.body);
    const user = await usersService.updateStatus(id, status);
    return ok(res, user, 'User status updated');
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (!(await ensureAdminCanTouchTarget(req, res, id))) return;
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
