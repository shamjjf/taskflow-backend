import { prisma } from '@/config/prisma';
import { NotificationType, ReferenceType } from '@prisma/client';
import { socketEvents } from '@/sockets';

// Push the notification over Socket.IO so the recipient's bell updates
// in real time. Wrapped in try/catch because socket isn't critical and
// must not break the DB write that already succeeded.
function pushSocket(userId: number, notification: unknown) {
  try {
    socketEvents.newNotification(userId, notification);
  } catch (err) {
    console.error('Failed to emit notification:new socket event:', err);
  }
}

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
    const notification = await prisma.notification.create({ data });
    pushSocket(data.userId, notification);
    return notification;
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
    const result = await prisma.notification.createMany({ data: items });
    // createMany doesn't return rows; emit a lightweight payload so the
    // client knows to refetch.
    items.forEach((item) => pushSocket(item.userId, item));
    return result;
  },

  async createForAdmins(
    payload: {
      type: NotificationType;
      title: string;
      message: string;
      referenceType?: ReferenceType;
      referenceId?: number;
    },
    options?: { excludeUserId?: number }
  ) {
    // Admin AND super_admin both get "admin-tier" notifications. The
    // previous filter only matched `admin` which left the Super Admin out
    // of every task event feed.
    const admins = await prisma.user.findMany({
      where: { role: { in: ['admin', 'super_admin'] } },
      select: { id: true },
    });
    const recipients = options?.excludeUserId
      ? admins.filter((a) => a.id !== options.excludeUserId)
      : admins;
    if (recipients.length === 0) return;
    await prisma.notification.createMany({
      data: recipients.map((a) => ({ userId: a.id, ...payload })),
    });
    recipients.forEach((a) => pushSocket(a.id, payload));
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
