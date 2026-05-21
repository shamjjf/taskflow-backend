import { prisma } from '@/config/prisma';
import { hashPassword } from '@/utils/password';

/**
 * Bootstrap a super-admin user on first startup, but ONLY if explicit
 * credentials have been provided via env vars. We deliberately do not ship
 * a default password — auto-bootstrapping with a hardcoded credential
 * means anyone who reads this repo can log in to a fresh deployment.
 *
 * Required env vars:
 *   SUPER_ADMIN_EMAIL
 *   SUPER_ADMIN_PASSWORD   (min 8 chars)
 * Optional:
 *   SUPER_ADMIN_NAME       (defaults to "Super Admin")
 *
 * Behaviour:
 *   - If a super-admin already exists in the DB: no-op.
 *   - If no super-admin exists AND env vars are set: creates it.
 *   - If no super-admin exists AND env vars are NOT set: logs a warning
 *     and returns without creating anything. Use the `seed.production.ts`
 *     script, or set the env vars and restart.
 */
export async function ensureSuperAdmin(): Promise<
  | { created: false; reason: 'already_exists' | 'env_missing' | 'env_invalid'; message?: string }
  | { created: true; email: string }
> {
  const existing = await prisma.user.findFirst({ where: { role: 'super_admin' } });
  if (existing) {
    return { created: false, reason: 'already_exists' };
  }

  const email = process.env.SUPER_ADMIN_EMAIL?.trim();
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME?.trim() || 'Super Admin';

  if (!email || !password) {
    return {
      created: false,
      reason: 'env_missing',
      message:
        'No super-admin exists and SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD are not set. ' +
        'Set them in the environment (or run prisma/seed.production.ts) to bootstrap an admin.',
    };
  }

  if (password.length < 8) {
    return {
      created: false,
      reason: 'env_invalid',
      message: 'SUPER_ADMIN_PASSWORD must be at least 8 characters.',
    };
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: 'super_admin',
      designation: 'Super Admin',
      status: 'active',
    },
  });
  return { created: true, email };
}
