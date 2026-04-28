import { prisma } from '@/config/prisma';

export const analyticsService = {
  async dashboard() {
    const [total, inProgress, completed, overdue] = await Promise.all([
      prisma.task.count(),
      prisma.task.count({ where: { status: 'in_progress' } }),
      prisma.task.count({ where: { status: 'completed' } }),
      prisma.task.count({ where: { status: 'overdue' } }),
    ]);

    return {
      totalTasks: total,
      inProgress,
      completed,
      overdue,
    };
  },

  async tasksByDepartment() {
    const depts = await prisma.department.findMany({
      include: {
        _count: {
          select: {
            tasks: true,
          },
        },
      },
    });

    const results = await Promise.all(
      depts.map(async (d) => ({
        label: d.name,
        completed: await prisma.task.count({
          where: { departmentId: d.id, status: 'completed' },
        }),
        inProgress: await prisma.task.count({
          where: { departmentId: d.id, status: 'in_progress' },
        }),
      }))
    );

    return results;
  },

  async topPerformers(limit = 5) {
    const users = await prisma.user.findMany({
      where: { role: 'employee' },
      include: {
        department: { select: { name: true } },
        taskAssignees: {
          include: { task: { select: { status: true } } },
        },
      },
    });

    const scored = users
      .map((u) => {
        const total = u.taskAssignees.length;
        const completed = u.taskAssignees.filter((ta) => ta.task.status === 'completed').length;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        return {
          userId: u.id,
          name: u.name,
          department: u.department?.name || '',
          completionRate,
          totalTasks: total,
        };
      })
      .sort((a, b) => b.completionRate - a.completionRate)
      .slice(0, limit);

    return scored;
  },
};
