import { Request, Response } from 'express';
import { z } from 'zod';
import { usersService } from './users.service';
import { authService } from '../auth/auth.service';
import { ok, created, notFound, unauthorized, forbidden, badRequest } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';
import { UserRole } from '@prisma/client';
import { socketEvents } from '@/sockets';

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
  email: z.string().email().optional(),
  role: z.enum(['super_admin', 'admin', 'team_leader', 'employee']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  departmentId: z.number().nullable().optional(),
});

// Self-update schema includes additional fields that only super admins are
// allowed to change about themselves (email, department, status). The
// controller filters these out for non-super-admin callers.
const selfUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  designation: z.string().optional(),
  phone: z.string().optional(),
  profileImage: z.string().optional(),
  email: z.string().email().optional(),
  departmentId: z.number().nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

const statusSchema = z.object({
  status: z.enum(['active', 'inactive']),
});

const setPasswordSchema = z.object({
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
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
    if (req.user.role === 'team_leader') {
      if (data.role !== 'employee') {
        return forbidden(res, 'Team leaders can only add employees');
      }
      if (!req.user.departmentId || data.departmentId !== req.user.departmentId) {
        return forbidden(res, 'Team leaders can only add users to their own department');
      }
    }
    const payload = data.role === 'admin' ? { ...data, departmentId: undefined } : data;
    const user = await usersService.create(payload);
    return created(res, user, 'User created');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const id = parseInt(req.params.id, 10);
    if (!(await ensureAdminCanTouchTarget(req, res, id))) return;
    const data = updateSchema.parse(req.body);
    if (data.role && req.user.role !== 'super_admin' && PROTECTED_ROLES.includes(data.role)) {
      return forbidden(res, 'Only the super admin can assign admin or super admin roles');
    }
    try {
      const user = await usersService.update(id, data);
      return ok(res, user, 'User updated');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'P2002') {
        return badRequest(res, 'That email is already in use');
      }
      throw err;
    }
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
    const data = selfUpdateSchema.parse(req.body);

    // Admins (and any non-super-admin) can only update name, phone, and
    // profile image about themselves. Strip anything else they may have sent.
    if (req.user.role !== 'super_admin') {
      delete data.email;
      delete data.departmentId;
      delete data.status;
      delete data.designation;
    }

    try {
      await usersService.update(req.user.userId, data);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code === 'P2002') {
        return badRequest(res, 'That email is already in use');
      }
      throw err;
    }

    const fresh = await usersService.getById(req.user.userId);
    if (!fresh) return notFound(res, 'User not found');

    // Flatten the department relation so the response matches the frontend's
    // expected BackendUser shape (`departmentName: string | null`).
    const { department, ...rest } = fresh as typeof fresh & {
      department?: { name: string } | null;
    };
    const flat = { ...rest, departmentName: department?.name ?? null };

    // Broadcast so every other client showing this user's avatar/name
    // (team lists, chat, task cards, admin user table) updates without a
    // page refresh.
    try {
      socketEvents.userUpdated(
        { id: flat.id, departmentId: flat.departmentId },
        flat
      );
    } catch (err) {
      console.error('Failed to emit user:profileUpdated socket event:', err);
    }

    return ok(res, flat, 'Profile updated');
  }),

  setPassword: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (!(await ensureAdminCanTouchTarget(req, res, id))) return;
    const { newPassword } = setPasswordSchema.parse(req.body);
    await authService.setUserPassword(id, newPassword);
    return ok(res, null, 'Password updated');
  }),
};
