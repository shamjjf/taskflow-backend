import { Request, Response } from 'express';
import { z } from 'zod';
import { reportsService } from './reports.service';
import { ok, created, notFound, unauthorized, forbidden } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';

const createSchema = z.object({
  reportType: z.enum(['daily', 'weekly', 'task']),
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
  description: z.string().min(1),
  taskId: z.number().nullable().optional(),
  attachmentUrl: z.string().nullable().optional(),
});

export const reportsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const reports = await reportsService.list({
      userId: req.user.userId,
      role: req.user.role,
      departmentId: req.user.departmentId,
    });
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
      description: data.description,
      taskId: data.taskId,
      attachmentUrl: data.attachmentUrl,
      reportDate: data.reportDate,
    });
    return created(res, report, 'Report submitted. Your Team Leader has been notified.');
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

  approve: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    if (req.user.role !== 'team_leader') {
      return forbidden(res, 'Only Team Leaders can approve reports');
    }
    const id = parseInt(req.params.id, 10);

    // Verify the report exists
    const report = await reportsService.getById(id);
    if (!report) return notFound(res, 'Report not found');

    const approved = await reportsService.approve(id, req.user.userId);
    return ok(res, approved, 'Report approved. Super Admin can now see it.');
  }),

  reject: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    if (req.user.role !== 'team_leader') {
      return forbidden(res, 'Only Team Leaders can reject reports');
    }
    const id = parseInt(req.params.id, 10);
    const { comment } = rejectSchema.parse(req.body);
    const rejected = await reportsService.reject(id, req.user.userId, comment);
    return ok(res, rejected, 'Report rejected. Employee has been notified.');
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
