/**
 * Production seed.
 *
 * Bootstraps a fresh database with the bare minimum needed for the app to
 * function: the seven departments and a single super-admin user. No fake
 * tasks, reports, notifications, conversations, or non-super-admin users.
 *
 * Required env vars (read from process.env, NOT defaulted):
 *   SUPER_ADMIN_EMAIL     — email for the bootstrap super-admin
 *   SUPER_ADMIN_PASSWORD  — initial password (the admin should change it on first login)
 *   SUPER_ADMIN_NAME      — display name (optional, defaults to "Super Admin")
 *
 * Usage:
 *   SUPER_ADMIN_EMAIL=admin@example.com \
 *   SUPER_ADMIN_PASSWORD='choose-a-strong-one' \
 *   SUPER_ADMIN_NAME='Jane Doe' \
 *     npx ts-node -r tsconfig-paths/register prisma/seed.production.ts
 *
 * This script is idempotent for departments (skipped if they exist) and for
 * the super-admin user (updated in place if the email already exists). It
 * never deletes existing data.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEPARTMENTS = [
  { name: 'Development', description: 'Engineering & software development' },
  { name: 'Social Media', description: 'Social media marketing & community' },
  { name: 'Graphic Design', description: 'Visual design & creative assets' },
  { name: 'Admin', description: 'Office administration & operations' },
  { name: 'HR', description: 'Human resources & recruitment' },
  { name: 'Content Writer', description: 'Blog posts, articles, copywriting' },
  { name: 'Outreach', description: 'Business development & outreach' },
];

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    throw new Error(
      'SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD env vars are required. ' +
        'Refusing to seed without an explicit bootstrap account.'
    );
  }

  if (password.length < 8) {
    throw new Error('SUPER_ADMIN_PASSWORD must be at least 8 characters.');
  }

  console.log('Seeding production data (departments + super-admin)...');

  for (const dept of DEPARTMENTS) {
    const existing = await prisma.department.findFirst({ where: { name: dept.name } });
    if (existing) {
      console.log(`  · department "${dept.name}" already exists, skipping`);
      continue;
    }
    await prisma.department.create({ data: dept });
    console.log(`  + created department "${dept.name}"`);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    await prisma.user.update({
      where: { email },
      data: { name, passwordHash, role: 'super_admin', status: 'active' },
    });
    console.log(`  · super-admin "${email}" already existed — password & profile reset`);
  } else {
    await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: 'super_admin',
        status: 'active',
      },
    });
    console.log(`  + created super-admin "${email}"`);
  }

  console.log('\nDone. The super-admin should sign in and change the password immediately.');
}

main()
  .catch((e) => {
    console.error('Production seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
