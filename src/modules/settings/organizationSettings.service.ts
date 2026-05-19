import { prisma } from '@/config/prisma';

const SINGLETON_ID = 1;

const DEFAULTS = {
  companyName: '',
  timeZone: 'ist',
};

export const organizationSettingsService = {
  /**
   * Returns the singleton organization settings row, creating it with
   * defaults on first access.
   */
  async get() {
    const existing = await prisma.organizationSettings.findUnique({
      where: { id: SINGLETON_ID },
    });
    if (existing) return existing;
    return prisma.organizationSettings.create({
      data: { id: SINGLETON_ID, ...DEFAULTS },
    });
  },

  async update(data: { companyName?: string; timeZone?: string }) {
    return prisma.organizationSettings.upsert({
      where: { id: SINGLETON_ID },
      update: {
        ...(data.companyName !== undefined && { companyName: data.companyName.trim() }),
        ...(data.timeZone !== undefined && { timeZone: data.timeZone }),
      },
      create: {
        id: SINGLETON_ID,
        companyName: data.companyName?.trim() ?? DEFAULTS.companyName,
        timeZone: data.timeZone ?? DEFAULTS.timeZone,
      },
    });
  },
};
