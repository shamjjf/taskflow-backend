import { prisma } from '@/config/prisma';
import { ReportType, ApprovalStatus, UserRole } from '@prisma/client';
import { socketEvents } from '@/sockets';

const reportInclude = {
  user: {
    select: {
      id: true,
      name: true,
      role: true,
      department: { select: { id: true, name: true, teamLeaderId: true } },
    },
  },
  task: { select: { id: true, title: true } },
  reviewedBy: { select: { id: true, name: true } },
};

export const reportsService = {
  async list(
    requester: { userId: number; role: UserRole; departmentId: number | null },
    options: { scope?: 'mine' | 'all' } = {}
  ) {
    const where: Record<string, unknown> = {};

    if (options.scope === 'mine') {
      where.userId = requester.userId;
    } else if (requester.role === 'employee') {
      where.userId = requester.userId;
    } else if (requester.role === 'team_leader' && requester.departmentId) {
      where.user = { departmentId: requester.departmentId };
    } else if (requester.role === 'admin') {
      // Admin sees the full lifecycle of reports authored by TLs and employees,
      // but never reports authored by other admins or the super admin.
      where.user = { role: { notIn: ['admin', 'super_admin'] } };
    } else if (requester.role === 'super_admin') {
      // Super Admin only sees approved reports that are flagged visible
      where.visibleToSuperAdmin = true;
    }

    return prisma.report.findMany({
      where,
      include: reportInclude,
      orderBy: { createdAt: 'desc' },
    });
  },

  async getPendingForTL(teamLeaderDeptId: number) {
    return prisma.report.findMany({
      where: {
        approvalStatus: 'pending',
        user: { departmentId: teamLeaderDeptId, role: { notIn: ['admin', 'super_admin'] } },
      },
      include: reportInclude,
      orderBy: { createdAt: 'desc' },
    });
  },

  async getPendingForSuperAdmin() {
    return prisma.report.findMany({
      where: {
        approvalStatus: 'pending',
        user: { role: 'admin' },
      },
      include: reportInclude,
      orderBy: { createdAt: 'desc' },
    });
  },

  async getAllAdminReports() {
    return prisma.report.findMany({
      where: { user: { role: 'admin' } },
      include: reportInclude,
      orderBy: { createdAt: 'desc' },
    });
  },

  async getApprovedForSuperAdmin() {
    return prisma.report.findMany({
      where: {
        approvalStatus: 'approved',
        visibleToSuperAdmin: true,
      },
      include: reportInclude,
      orderBy: { reviewedAt: 'desc' },
    });
  },

  async getById(id: number) {
    return prisma.report.findUnique({
      where: { id },
      include: reportInclude,
    });
  },

  async create(data: {
    userId: number;
    reportType: ReportType;
    weeklyObjective?: string;
    description: string;
    taskId?: number;
    attachmentUrl?: string;
    reportDate: Date;
  }) {
    const author = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { role: true },
    });
    const isAdminAuthored = author?.role === 'admin';
    // Team leaders are the approvers for their department, so their own reports
    // skip the TL review queue and go straight to approved (visible to Super
    // Admin and Admin immediately).
    const autoApprove = author?.role === 'team_leader';

    const report = await prisma.report.create({
      data: {
        userId: data.userId,
        reportType: data.reportType,
        weeklyObjective: data.reportType === 'weekly' ? data.weeklyObjective : null,
        description: data.description,
        taskId: data.taskId,
        attachmentUrl: data.attachmentUrl,
        reportDate: data.reportDate,
        approvalStatus: autoApprove ? 'approved' : 'pending',
        visibleToSuperAdmin: autoApprove,
        ...(autoApprove ? { reviewedById: data.userId, reviewedAt: new Date() } : {}),
      },
      include: reportInclude,
    });

    if (autoApprove) {
      socketEvents.reportApproved(report.userId, report);
    } else if (isAdminAuthored) {
      socketEvents.reportSubmittedToSuperAdmin(report);
    } else {
      const tlId = report.user.department?.teamLeaderId ?? null;
      if (tlId && tlId !== data.userId) {
        socketEvents.reportSubmitted(tlId, report);
      }
    }

    return report;
  },

  async approve(id: number, reviewedById: number) {
    const report = await prisma.report.update({
      where: { id },
      data: {
        approvalStatus: 'approved',
        visibleToSuperAdmin: true,
        reviewedById,
        reviewedAt: new Date(),
      },
      include: reportInclude,
    });

    socketEvents.reportApproved(report.userId, report);

    return report;
  },

  async reject(id: number, reviewedById: number, comment: string) {
    const report = await prisma.report.update({
      where: { id },
      data: {
        approvalStatus: 'rejected',
        reviewedById,
        reviewedAt: new Date(),
        reviewComment: comment,
      },
      include: reportInclude,
    });

    socketEvents.reportRejected(report.userId, report);

    return report;
  },

  async resubmit(
    id: number,
    data: {
      description: string;
      reportType?: ReportType;
      weeklyObjective?: string | null;
      taskId?: number | null;
      attachmentUrl?: string | null;
    }
  ) {
    const existing = await prisma.report.findUnique({
      where: { id },
      select: { userId: true, user: { select: { role: true } } },
    });
    const autoApprove = existing?.user?.role === 'team_leader';

    const effectiveType = data.reportType;
    const report = await prisma.report.update({
      where: { id },
      data: {
        description: data.description,
        ...(effectiveType ? { reportType: effectiveType } : {}),
        ...(effectiveType === 'weekly'
          ? { weeklyObjective: data.weeklyObjective ?? null }
          : effectiveType
          ? { weeklyObjective: null }
          : data.weeklyObjective !== undefined
          ? { weeklyObjective: data.weeklyObjective }
          : {}),
        ...(data.taskId !== undefined ? { taskId: data.taskId } : {}),
        ...(data.attachmentUrl !== undefined ? { attachmentUrl: data.attachmentUrl } : {}),
        approvalStatus: autoApprove ? 'approved' : 'pending',
        visibleToSuperAdmin: autoApprove,
        reviewedById: autoApprove ? existing?.userId ?? null : null,
        reviewedAt: autoApprove ? new Date() : null,
        reviewComment: null,
      },
      include: reportInclude,
    });

    if (autoApprove) {
      socketEvents.reportApproved(report.userId, report);
    } else if (report.user.role === 'admin') {
      socketEvents.reportSubmittedToSuperAdmin(report);
    } else {
      const tlId = report.user.department?.teamLeaderId ?? null;
      if (tlId && tlId !== report.userId) {
        socketEvents.reportSubmitted(tlId, report);
      }
    }

    return report;
  },
};
