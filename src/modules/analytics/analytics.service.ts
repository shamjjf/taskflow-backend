import { prisma } from '@/config/prisma';
import { UserRole } from '@prisma/client';

export type AnalyticsPeriod = '7' | '30' | 'quarter';

function periodStart(period?: string): Date | null {
  const now = new Date();
  if (period === '7') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (period === '30') {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }
  if (period === 'quarter') {
    const quarter = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), quarter * 3, 1);
  }
  return null;
}

// Admin's dashboard excludes tasks created by other admins or the super admin.
function creatorFilter(requesterRole?: UserRole) {
  if (requesterRole === 'admin') {
    return { createdBy: { role: { notIn: ['admin', 'super_admin'] as UserRole[] } } };
  }
  return {};
}

export const analyticsService = {
  async dashboard(organizationId: number, period?: string, requesterRole?: UserRole) {
    const start = periodStart(period);
    const dateFilter = start ? { createdAt: { gte: start } } : {};
    const scope = creatorFilter(requesterRole);
    // Every count is fenced by organizationId so dashboard tiles never mix
    // numbers from another tenant.
    const base = { organizationId, ...dateFilter, ...scope };

    const [total, inProgress, completed, overdue] = await Promise.all([
      prisma.task.count({ where: base }),
      prisma.task.count({ where: { ...base, status: 'in_progress' } }),
      prisma.task.count({ where: { ...base, status: 'completed' } }),
      prisma.task.count({ where: { ...base, status: 'overdue' } }),
    ]);

    return {
      totalTasks: total,
      inProgress,
      completed,
      overdue,
    };
  },

  async tasksByDepartment(organizationId: number, period?: string, requesterRole?: UserRole) {
    const start = periodStart(period);
    const dateFilter = start ? { createdAt: { gte: start } } : {};
    const scope = creatorFilter(requesterRole);

    const depts = await prisma.department.findMany({
      where: { organizationId },
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
          where: {
            organizationId,
            ...dateFilter,
            ...scope,
            departmentId: d.id,
            status: 'completed',
          },
        }),
        inProgress: await prisma.task.count({
          where: {
            organizationId,
            ...dateFilter,
            ...scope,
            departmentId: d.id,
            status: 'in_progress',
          },
        }),
      }))
    );

    return results;
  },

  async topPerformers(organizationId: number, limit = 5, period?: string) {
    const start = periodStart(period);
    const taskWhere = start ? { task: { createdAt: { gte: start } } } : {};

    const users = await prisma.user.findMany({
      where: { role: 'employee', organizationId },
      include: {
        department: { select: { name: true } },
        taskAssignees: {
          where: taskWhere,
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
