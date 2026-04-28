import { prisma } from '@/config/prisma';

export const activityService = {
  async list(limit = 50) {
    return prisma.activityLog.findMany({
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  async log(data: {
    userId: number;
    action: string;
    entityType?: string;
    entityId?: number;
    ipAddress?: string;
  }) {
    return prisma.activityLog.create({ data });
  },
};
