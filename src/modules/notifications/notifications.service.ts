import { prisma } from '@/config/prisma';
import { NotificationType, ReferenceType } from '@prisma/client';

export const notificationsService = {
  async list(userId: number) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  async create(data: {
    userId: number;
    type: NotificationType;
    title: string;
    message: string;
    referenceType?: ReferenceType;
    referenceId?: number;
  }) {
    return prisma.notification.create({ data });
  },

  async createMany(
    items: {
      userId: number;
      type: NotificationType;
      title: string;
      message: string;
      referenceType?: ReferenceType;
      referenceId?: number;
    }[]
  ) {
    return prisma.notification.createMany({ data: items });
  },

  async createForAdmins(payload: {
    type: NotificationType;
    title: string;
    message: string;
    referenceType?: ReferenceType;
    referenceId?: number;
  }) {
    const admins = await prisma.user.findMany({
      where: { role: 'admin' },
      select: { id: true },
    });
    if (admins.length === 0) return;
    await prisma.notification.createMany({
      data: admins.map((a) => ({ userId: a.id, ...payload })),
    });
  },

  async markRead(id: number, userId: number) {
    return prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  },

  async markAllRead(userId: number) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  },

  async unreadCount(userId: number) {
    return prisma.notification.count({
      where: { userId, isRead: false },
    });
  },
};
