import { Request, Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import { reportsService } from './reports.service';
import { runDailyReportJob } from './dailyReportJob';
import { runWeeklyReportJob } from './weeklyReportJob';
import { getReportFilePath, isSafeFilename, verifyReportToken } from './reportFiles';
import { ok, created, notFound, unauthorized, forbidden, badRequest } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';

const createSchema = z.object({
  reportType: z.enum(['daily', 'weekly', 'task']),
  weeklyObjective: z.string().optional(),
  description: z.string().min(1),
  taskId: z.number().optional(),
  attachmentUrl: z.string().optional(),
  reportDate: z
    .string()
    .optional()
    .transform((s) => (s ? new Date(s) : new Date())),
});

const rejectSchema = z.object({
  comment: z.string().min(1, 'Rejection comment is required'),
});

const resubmitSchema = z.object({
  reportType: z.enum(['daily', 'weekly', 'task']).optional(),
  weeklyObjective: z.string().nullable().optional(),
  description: z.string().min(1),
  taskId: z.number().nullable().optional(),
  attachmentUrl: z.string().nullable().optional(),
});

export const reportsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const scope = req.query.scope === 'mine' ? 'mine' : 'all';
    const reports = await reportsService.list(
      {
        userId: req.user.userId,
        role: req.user.role,
        departmentId: req.user.departmentId,
      },
      { scope }
    );
    return ok(res, reports);
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    const report = await reportsService.getById(id);
    if (!report) return notFound(res, 'Report not found');
    return ok(res, report);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const data = createSchema.parse(req.body);
    const report = await reportsService.create({
      userId: req.user.userId,
      reportType: data.reportType,
      weeklyObjective: data.reportType === 'weekly' ? data.weeklyObjective : undefined,
      description: data.description,
      taskId: data.taskId,
      attachmentUrl: data.attachmentUrl,
      reportDate: data.reportDate,
    });
    const message =
      req.user.role === 'team_leader'
        ? 'Report submitted and auto-approved. Visible to Super Admin and Admin.'
        : req.user.role === 'admin'
        ? 'Report submitted. The Super Admin has been notified.'
        : 'Report submitted. Your Team Leader has been notified.';
    return created(res, report, message);
  }),

  pending: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    if (req.user.role !== 'team_leader' || !req.user.departmentId) {
      return forbidden(res, 'Only Team Leaders can view pending approvals');
    }
    const reports = await reportsService.getPendingForTL(req.user.departmentId);
    return ok(res, reports);
  }),

  approvedForSuperAdmin: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    if (req.user.role !== 'super_admin') {
      return forbidden(res);
    }
    const reports = await reportsService.getApprovedForSuperAdmin();
    return ok(res, reports);
  }),

  pendingForSuperAdmin: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    if (req.user.role !== 'super_admin') {
      return forbidden(res, 'Only Super Admin can view pending admin reports');
    }
    const reports = await reportsService.getPendingForSuperAdmin();
    return ok(res, reports);
  }),

  allAdminReports: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    if (req.user.role !== 'super_admin') {
      return forbidden(res, 'Only Super Admin can view admin reports history');
    }
    const reports = await reportsService.getAllAdminReports();
    return ok(res, reports);
  }),

  approve: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const id = parseInt(req.params.id, 10);

    const report = await reportsService.getById(id);
    if (!report) return notFound(res, 'Report not found');

    const isAdminAuthored = report.user.role === 'admin';
    if (isAdminAuthored) {
      if (req.user.role !== 'super_admin') {
        return forbidden(res, 'Only the Super Admin can approve admin reports');
      }
    } else {
      if (req.user.role !== 'team_leader') {
        return forbidden(res, 'Only Team Leaders can approve reports');
      }
    }

    const approved = await reportsService.approve(id, req.user.userId);
    return ok(res, approved, 'Report approved.');
  }),

  reject: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const id = parseInt(req.params.id, 10);

    const report = await reportsService.getById(id);
    if (!report) return notFound(res, 'Report not found');

    const isAdminAuthored = report.user.role === 'admin';
    if (isAdminAuthored) {
      if (req.user.role !== 'super_admin') {
        return forbidden(res, 'Only the Super Admin can reject admin reports');
      }
    } else {
      if (req.user.role !== 'team_leader') {
        return forbidden(res, 'Only Team Leaders can reject reports');
      }
    }

    const { comment } = rejectSchema.parse(req.body);
    const rejected = await reportsService.reject(id, req.user.userId, comment);
    return ok(res, rejected, 'Report rejected. The author has been notified.');
  }),

  triggerDailyReportEmail: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    if (req.user.role !== 'super_admin') {
      return forbidden(res, 'Only Super Admin can trigger the daily report email');
    }
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    const refDate = dateParam ? new Date(dateParam) : new Date();
    if (Number.isNaN(refDate.getTime())) {
      return forbidden(res, 'Invalid date query param');
    }
    const result = await runDailyReportJob(refDate);
    return ok(res, result, 'Daily report email job executed.');
  }),

  serveReportFile: asyncHandler(async (req: Request, res: Response) => {
    const filename = req.params.filename;
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const expires = parseInt(typeof req.query.expires === 'string' ? req.query.expires : '0', 10);
    if (!filename || !isSafeFilename(filename)) return badRequest(res, 'Invalid filename');
    if (!token || !expires) return forbidden(res, 'Missing token');
    if (!verifyReportToken(filename, expires, token)) {
      return forbidden(res, 'Invalid or expired link');
    }
    const filePath = getReportFilePath(filename);
    if (!fs.existsSync(filePath)) return notFound(res, 'Report file not found');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    fs.createReadStream(filePath).pipe(res);
  }),

  triggerWeeklyReportEmail: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    if (req.user.role !== 'super_admin') {
      return forbidden(res, 'Only Super Admin can trigger the weekly report email');
    }
    const dateParam = typeof req.query.date === 'string' ? req.query.date : undefined;
    const refDate = dateParam ? new Date(dateParam) : new Date();
    if (Number.isNaN(refDate.getTime())) {
      return forbidden(res, 'Invalid date query param');
    }
    const result = await runWeeklyReportJob(refDate);
    return ok(res, result, 'Weekly report email job executed.');
  }),

  resubmit: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const id = parseInt(req.params.id, 10);

    const existing = await reportsService.getById(id);
    if (!existing) return notFound(res, 'Report not found');

    if (existing.userId !== req.user.userId) {
      return forbidden(res, 'You can only resubmit your own reports');
    }
    if (existing.approvalStatus !== 'rejected') {
      return forbidden(res, 'Only rejected reports can be resubmitted');
    }

    const data = resubmitSchema.parse(req.body);
    const updated = await reportsService.resubmit(id, data);
    return ok(res, updated, 'Report resubmitted. Your Team Leader has been notified.');
  }),
};
