import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { forbidden, unauthorized } from '@/utils/response';

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return unauthorized(res);
    }
    if (!allowedRoles.includes(req.user.role)) {
      return forbidden(res, `Access denied. Required role: ${allowedRoles.join(' or ')}`);
    }
    next();
  };
}

export const requireSuperAdmin = requireRole('super_admin');
export const requireTeamLeader = requireRole('team_leader');
export const requireAdminOrAbove = requireRole('super_admin', 'admin');
export const requireTLOrAbove = requireRole('super_admin', 'admin', 'team_leader');
