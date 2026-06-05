import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '@/utils/jwt';
import { unauthorized, forbidden } from '@/utils/response';
import { prisma } from '@/config/prisma';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(res, 'Missing or invalid Authorization header');
  }

  const token = authHeader.substring(7);

  let payload: JwtPayload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    return unauthorized(res, 'Invalid or expired token');
  }

  // Re-validate the caller against the DB on every request so a deactivated,
  // deleted, demoted, or reassigned user cannot keep operating with a stale
  // JWT. The access token has a long TTL, so without this check role and
  // department changes wouldn't take effect until the token expired.
  try {
    const fresh = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, departmentId: true, status: true },
    });
    if (!fresh) {
      return unauthorized(res, 'Account no longer exists');
    }
    if (fresh.status === 'inactive') {
      return forbidden(res, 'Account is deactivated');
    }
    req.user = {
      userId: fresh.id,
      email: fresh.email,
      role: fresh.role,
      departmentId: fresh.departmentId,
    };
    next();
  } catch (err) {
    return unauthorized(res, 'Authentication check failed');
  }
}
