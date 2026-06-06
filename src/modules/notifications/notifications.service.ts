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
  async list(userId: number, organizationId: number) {
    // Notification rows carry an explicit organizationId — filter on it
    // even though the userId join would technically achieve the same,
    // so an attacker who forged a notification with the wrong org id
    // still can't read it through this endpoint.
    return prisma.notification.findMany({
      where: { userId, organizationId },
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
    // Notification rows are denormalized with organizationId for fast
    // per-tenant filtering; we resolve it from the recipient user here so
    // callers don't have to pass it everywhere.
    const recipient = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { organizationId: true },
    });
    const notification = await prisma.notification.create({
      data: { ...data, organizationId: recipient?.organizationId ?? 1 },
    });
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
    options?: { excludeUserId?: number; organizationId?: number }
  ) {
    // Admin tier is per-org now: only notify admins/super_admin who
    // actually belong to the same organization as the action. If
    // organizationId isn't passed (legacy callers), fall back to org 1.
    const organizationId = options?.organizationId ?? 1;
    const admins = await prisma.user.findMany({
      where: { role: { in: ['admin', 'super_admin'] }, organizationId },
      select: { id: true },
    });
    const recipients = options?.excludeUserId
      ? admins.filter((a) => a.id !== options.excludeUserId)
      : admins;
    if (recipients.length === 0) return;
    await prisma.notification.createMany({
      data: recipients.map((a) => ({ userId: a.id, organizationId, ...payload })),
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
