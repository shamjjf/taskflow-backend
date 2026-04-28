import { prisma } from '@/config/prisma';

export const departmentsService = {
  async list() {
    const departments = await prisma.department.findMany({
      include: {
        teamLeader: { select: { id: true, name: true, email: true } },
        _count: {
          select: {
            users: true,
            tasks: { where: { status: { in: ['assigned', 'in_progress'] } } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return departments.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      teamLeaderId: d.teamLeaderId,
      teamLeaderName: d.teamLeader?.name || null,
      memberCount: d._count.users,
      activeTaskCount: d._count.tasks,
      createdAt: d.createdAt,
    }));
  },

  async getById(id: number) {
    return prisma.department.findUnique({
      where: { id },
      include: {
        teamLeader: { select: { id: true, name: true, email: true } },
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            designation: true,
            status: true,
          },
        },
      },
    });
  },

  async create(data: { name: string; description?: string; teamLeaderId?: number }) {
    return prisma.department.create({ data });
  },

  async update(id: number, data: { name?: string; description?: string; teamLeaderId?: number }) {
    return prisma.department.update({ where: { id }, data });
  },

  async delete(id: number) {
    return prisma.department.delete({ where: { id } });
  },

  async assignLeader(id: number, teamLeaderId: number) {
    // Update the user to be team_leader
    await prisma.user.update({
      where: { id: teamLeaderId },
      data: { role: 'team_leader', departmentId: id },
    });
    return prisma.department.update({
      where: { id },
      data: { teamLeaderId },
    });
  },

  async getMembers(departmentId: number) {
    return prisma.user.findMany({
      where: { departmentId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        designation: true,
        status: true,
        lastLoginAt: true,
      },
      orderBy: { name: 'asc' },
    });
  },
};
