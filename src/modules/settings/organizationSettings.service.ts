import { prisma } from '@/config/prisma';

const DEFAULTS = {
  companyName: '',
  timeZone: 'ist',
};

// Per-organization settings: one row per organizationId. The schema changed
// from a singleton (id=1) to a per-tenant table — the row is auto-created
// the first time an org's super_admin opens the Settings page.
export const organizationSettingsService = {
  async get(organizationId: number) {
    const existing = await prisma.organizationSettings.findUnique({
      where: { organizationId },
    });
    if (existing) return existing;
    return prisma.organizationSettings.create({
      data: { organizationId, ...DEFAULTS },
    });
  },

  async update(
    organizationId: number,
    data: { companyName?: string; timeZone?: string }
  ) {
    return prisma.organizationSettings.upsert({
      where: { organizationId },
      update: {
        ...(data.companyName !== undefined && { companyName: data.companyName.trim() }),
        ...(data.timeZone !== undefined && { timeZone: data.timeZone }),
      },
      create: {
        organizationId,
        companyName: data.companyName?.trim() ?? DEFAULTS.companyName,
        timeZone: data.timeZone ?? DEFAULTS.timeZone,
      },
    });
  },
};
