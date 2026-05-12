import { prisma } from '@/config/prisma';
import { ReportType, ApprovalStatus, UserRole } from '@prisma/client';

const reportInclude = {
  user: { select: { id: true, name: true, department: { select: { name: true } } } },
  task: { select: { id: true, title: true } },
  reviewedBy: { select: { id: true, name: true } },
};

export const reportsService = {
  async list(requester: { userId: number; role: UserRole; departmentId: number | null }) {
    const where: Record<string, unknown> = {};

    if (requester.role === 'employee') {
      where.userId = requester.userId;
    } else if (requester.role === 'team_leader' && requester.departmentId) {
      where.user = { departmentId: requester.departmentId };
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
        user: { departmentId: teamLeaderDeptId },
      },
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
    description: string;
    taskId?: number;
    attachmentUrl?: string;
    reportDate: Date;
  }) {
    return prisma.report.create({
      data: {
        userId: data.userId,
        reportType: data.reportType,
        description: data.description,
        taskId: data.taskId,
        attachmentUrl: data.attachmentUrl,
        reportDate: data.reportDate,
        approvalStatus: 'pending',
        visibleToSuperAdmin: false,
      },
      include: reportInclude,
    });
  },

  async approve(id: number, reviewedById: number) {
    return prisma.report.update({
      where: { id },
      data: {
        approvalStatus: 'approved',
        visibleToSuperAdmin: true,
        reviewedById,
        reviewedAt: new Date(),
      },
      include: reportInclude,
    });
  },

  async reject(id: number, reviewedById: number, comment: string) {
    return prisma.report.update({
      where: { id },
      data: {
        approvalStatus: 'rejected',
        reviewedById,
        reviewedAt: new Date(),
        reviewComment: comment,
      },
      include: reportInclude,
    });
  },

  async resubmit(
    id: number,
    data: {
      description: string;
      reportType?: ReportType;
      taskId?: number | null;
      attachmentUrl?: string | null;
    }
  ) {
    return prisma.report.update({
      where: { id },
      data: {
        description: data.description,
        ...(data.reportType ? { reportType: data.reportType } : {}),
        ...(data.taskId !== undefined ? { taskId: data.taskId } : {}),
        ...(data.attachmentUrl !== undefined ? { attachmentUrl: data.attachmentUrl } : {}),
        approvalStatus: 'pending',
        visibleToSuperAdmin: false,
        reviewedById: null,
        reviewedAt: null,
        reviewComment: null,
      },
      include: reportInclude,
    });
  },
};
