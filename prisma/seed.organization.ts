/**
 * Multi-tenant org bootstrap script.
 *
 * Creates a new organization + its super_admin in one go. Designed to be
 * invoked manually from the server shell when a new customer is being
 * provisioned (e.g. 1xl). The default org "JJF India" (id=1, slug=jjfindia)
 * is already created by the migration that introduces the organizations
 * table, so this script is only needed for orgs #2 and onward.
 *
 * Usage (PowerShell / bash, on the server):
 *
 *   ORG_SLUG=1xl \
 *   ORG_NAME="1XL Pvt Ltd" \
 *   SUPER_ADMIN_EMAIL=admin@1xl.com \
 *   SUPER_ADMIN_PASSWORD="ChangeMe!2026" \
 *   SUPER_ADMIN_NAME="1XL Super Admin" \
 *   npx ts-node prisma/seed.organization.ts
 *
 * Behaviour:
 *   - Idempotent: re-running with the same slug only creates what's missing
 *   - Won't downgrade an existing super_admin's password — for resets use
 *     the password change flow in the app or a separate utility.
 *   - Logs the seeded email back to stdout. The password is NEVER printed.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient();

function readEnv(name: string, required: true): string;
function readEnv(name: string, required: false): string | undefined;
function readEnv(name: string, required: boolean): string | undefined {
  const value = process.env[name]?.trim();
  if (required && !value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

async function main() {
  const slug = readEnv('ORG_SLUG', true);
  const name = readEnv('ORG_NAME', true);
  const adminEmail = readEnv('SUPER_ADMIN_EMAIL', true);
  const adminPassword = readEnv('SUPER_ADMIN_PASSWORD', true);
  const adminName = readEnv('SUPER_ADMIN_NAME', false) || 'Super Admin';

  if (adminPassword.length < 8) {
    throw new Error('SUPER_ADMIN_PASSWORD must be at least 8 characters');
  }

  // Step 1: upsert the organization (idempotent on slug)
  const org = await prisma.organization.upsert({
    where: { slug },
    update: { name, status: 'active' },
    create: { slug, name, status: 'active' },
  });
  console.log(`[seed-org] organization ready: id=${org.id} slug=${org.slug} name=${org.name}`);

  // Step 2: upsert the super_admin for this org. We use the composite
  // (email, organizationId) unique key so the same email could exist in
  // multiple orgs without colliding.
  const existing = await prisma.user.findUnique({
    where: { email_organizationId: { email: adminEmail, organizationId: org.id } },
  });

  if (existing) {
    console.log(
      `[seed-org] super_admin ${adminEmail} already exists in org "${slug}" — leaving password untouched.`
    );
  } else {
    const passwordHash = await hashPassword(adminPassword);
    await prisma.user.create({
      data: {
        organizationId: org.id,
        name: adminName,
        email: adminEmail,
        passwordHash,
        role: 'super_admin',
        designation: 'Super Admin',
        status: 'active',
      },
    });
    console.log(`[seed-org] super_admin created: ${adminEmail} (in org "${slug}")`);
  }

  // Step 3: seed a per-org settings row so the Settings page renders with
  // the right company name out of the box.
  await prisma.organizationSettings.upsert({
    where: { organizationId: org.id },
    update: { companyName: name },
    create: { organizationId: org.id, companyName: name, timeZone: 'ist' },
  });
  console.log(`[seed-org] organization_settings ready for org id=${org.id}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed-org] failed:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
