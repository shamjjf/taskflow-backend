import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '@/config/env';
import { UserRole } from '@prisma/client';

export interface JwtPayload {
  userId: number;
  email: string;
  role: UserRole;
  departmentId: number | null;
  // Multi-tenancy: every authenticated request is scoped to the org the
  // user belongs to. Baked into the JWT so middleware/services can filter
  // queries without an extra DB hit.
  organizationId: number;
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as SignOptions);
}

export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
}
