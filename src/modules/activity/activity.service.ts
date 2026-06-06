import { prisma } from '@/config/prisma';

export const activityService = {
  // Activity feed is fenced by the caller's org so a Super Admin in JJF
  // never sees 1xl audit entries (and vice versa).
  async list(organizationId: number, limit = 50) {
    return prisma.activityLog.findMany({
      where: { organizationId },
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
    organizationId?: number;
  }) {
    // organizationId is denormalized on activity_logs so the audit feed
    // can be filtered without a join. If the caller doesn't pass it,
    // resolve it from the actor for safety.
    let organizationId = data.organizationId;
    if (organizationId === undefined) {
      const actor = await prisma.user.findUnique({
        where: { id: data.userId },
        select: { organizationId: true },
      });
      organizationId = actor?.organizationId ?? 1;
    }
    return prisma.activityLog.create({
      data: {
        userId: data.userId,
        organizationId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        ipAddress: data.ipAddress,
      },
    });
  },
};
