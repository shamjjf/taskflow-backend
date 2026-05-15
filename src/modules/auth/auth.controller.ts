import { Request, Response } from 'express';
import { z } from 'zod';
import { authService } from './auth.service';
import { ok, created, unauthorized, badRequest } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const registerSchema = z.object({
  name: z.string().min(2).max(150),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['super_admin', 'admin', 'team_leader', 'employee']),
  departmentId: z.number().optional(),
  designation: z.string().optional(),
});

export const authController = {
  login: asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = loginSchema.parse(req.body);
    try {
      const result = await authService.login(email, password);
      return ok(res, result, 'Login successful');
    } catch (err) {
      return unauthorized(res, 'Invalid email or password');
    }
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    try {
      const tokens = await authService.refresh(refreshToken);
      return ok(res, tokens, 'Token refreshed');
    } catch (err) {
      return unauthorized(res, 'Invalid refresh token');
    }
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    await authService.logout(req.user.userId);
    return ok(res, null, 'Logged out');
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const user = await authService.me(req.user.userId);
    return ok(res, user);
  }),

  register: asyncHandler(async (req: Request, res: Response) => {
    const data = registerSchema.parse(req.body);
    const user = await authService.register(data);
    return created(res, user, 'User registered');
  }),
};
