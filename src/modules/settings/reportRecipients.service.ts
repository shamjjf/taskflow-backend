import { prisma } from '@/config/prisma';

export const reportRecipientsService = {
  list() {
    return prisma.reportRecipient.findMany({
      orderBy: { createdAt: 'asc' },
    });
  },

  /**
   * Returns just the email strings — used by the daily/weekly report jobs to
   * extend their BCC list beyond the admin/super_admin recipients.
   */
  async listEmails(): Promise<string[]> {
    const rows = await prisma.reportRecipient.findMany({
      select: { email: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => r.email);
  },

  create(data: { email: string; label?: string | null }) {
    return prisma.reportRecipient.create({
      data: {
        email: data.email.trim().toLowerCase(),
        label: data.label?.trim() || null,
      },
    });
  },

  update(id: number, data: { email?: string; label?: string | null }) {
    return prisma.reportRecipient.update({
      where: { id },
      data: {
        ...(data.email !== undefined && { email: data.email.trim().toLowerCase() }),
        ...(data.label !== undefined && { label: data.label?.trim() || null }),
      },
    });
  },

  delete(id: number) {
    return prisma.reportRecipient.delete({ where: { id } });
  },
};
