import { prisma } from '@/config/prisma';
import { hashPassword } from '@/utils/password';

const DEFAULT_SUPER_ADMIN = {
  name: 'JJF Super Admin',
  email: 'admin@jjfindia.com',
  password: 'Admin@1234',
};

export async function ensureSuperAdmin() {
  const existing = await prisma.user.findFirst({ where: { role: 'super_admin' } });
  if (existing) {
    return { created: false };
  }

  const passwordHash = await hashPassword(DEFAULT_SUPER_ADMIN.password);
  await prisma.user.create({
    data: {
      name: DEFAULT_SUPER_ADMIN.name,
      email: DEFAULT_SUPER_ADMIN.email,
      passwordHash,
      role: 'super_admin',
      designation: 'Super Admin',
      status: 'active',
    },
  });
  return { created: true, email: DEFAULT_SUPER_ADMIN.email };
}
