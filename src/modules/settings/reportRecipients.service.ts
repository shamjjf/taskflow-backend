import { prisma } from '@/config/prisma';

// All per-tenant: every read & write is scoped to the caller's org so 1xl
// recipients never receive JJF emails and vice versa.
export const reportRecipientsService = {
  list(organizationId: number) {
    return prisma.reportRecipient.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'asc' },
    });
  },

  /**
   * Returns just the email strings — used by the daily/weekly report jobs to
   * extend their BCC list beyond the admin/super_admin recipients of a
   * specific organization.
   */
  async listEmails(organizationId: number): Promise<string[]> {
    const rows = await prisma.reportRecipient.findMany({
      where: { organizationId },
      select: { email: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => r.email);
  },

  create(organizationId: number, data: { email: string; label?: string | null }) {
    return prisma.reportRecipient.create({
      data: {
        organizationId,
        email: data.email.trim().toLowerCase(),
        label: data.label?.trim() || null,
      },
    });
  },

  async update(
    id: number,
    organizationId: number,
    data: { email?: string; label?: string | null }
  ) {
    // Cross-tenant fence: confirm the row actually belongs to the caller's
    // org BEFORE update so a Super Admin in JJF can't edit 1xl recipients
    // by guessing the id.
    const existing = await prisma.reportRecipient.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!existing || existing.organizationId !== organizationId) {
      throw Object.assign(new Error('Recipient not found'), { code: 'P2025' });
    }
    return prisma.reportRecipient.update({
      where: { id },
      data: {
        ...(data.email !== undefined && { email: data.email.trim().toLowerCase() }),
        ...(data.label !== undefined && { label: data.label?.trim() || null }),
      },
    });
  },

  async delete(id: number, organizationId: number) {
    const existing = await prisma.reportRecipient.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    if (!existing || existing.organizationId !== organizationId) {
      throw Object.assign(new Error('Recipient not found'), { code: 'P2025' });
    }
    return prisma.reportRecipient.delete({ where: { id } });
  },
};
