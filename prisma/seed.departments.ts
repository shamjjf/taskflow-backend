/**
 * Departments-only seed.
 *
 * Inserts the seven production departments without touching users or any
 * other table. Idempotent: skips departments that already exist by name.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register prisma/seed.departments.ts
 */

import { PrismaClient } from '@prisma/client';

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
  console.log('Seeding departments...');

  for (const dept of DEPARTMENTS) {
    const existing = await prisma.department.findFirst({ where: { name: dept.name } });
    if (existing) {
      console.log(`  · "${dept.name}" already exists, skipping`);
      continue;
    }
    await prisma.department.create({ data: dept });
    console.log(`  + created "${dept.name}"`);
  }

  console.log('\nDone.');
}

main()
  .catch((e) => {
    console.error('Department seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
