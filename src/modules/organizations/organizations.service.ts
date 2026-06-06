import { prisma } from '@/config/prisma';

export const organizationsService = {
  // Public: used by the login screen dropdown so the user can pick which
  // org they're signing into before subdomain routing is wired up.
  // Returns only id/slug/name for active orgs — no internal counts or
  // settings, since this endpoint is unauthenticated.
  async listPublic() {
    return prisma.organization.findMany({
      where: { status: 'active' },
      select: { id: true, slug: true, name: true },
      orderBy: { name: 'asc' },
    });
  },

  async getBySlug(slug: string) {
    return prisma.organization.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, status: true },
    });
  },

  async getById(id: number) {
    return prisma.organization.findUnique({
      where: { id },
      select: { id: true, slug: true, name: true, status: true },
    });
  },
};
