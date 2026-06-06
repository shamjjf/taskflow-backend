import { Request, Response } from 'express';
import { z } from 'zod';
import { tasksService } from './tasks.service';
import { ok, created, notFound, unauthorized, badRequest, forbidden } from '@/utils/response';
import { asyncHandler } from '@/utils/asyncHandler';
import { TaskPriority, TaskStatus, UserRole } from '@prisma/client';

// A task is visible / interactable to the caller if they are an assignee,
// the team leader of its department, or admin/super_admin. Used by GET,
// comment, and attachment endpoints to stop cross-department info leaks.
function canAccessTask(
  task: { departmentId: number; assignees: Array<{ userId: number }> },
  user: { userId: number; role: UserRole; departmentId: number | null }
): boolean {
  if (user.role === 'super_admin' || user.role === 'admin') return true;
  if (task.assignees.some((a) => a.userId === user.userId)) return true;
  if (user.role === 'team_leader' && user.departmentId === task.departmentId) return true;
  return false;
}

const createSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  departmentId: z.number(),
  priority: z.enum(['low', 'medium', 'high']),
  deadline: z.string().transform((s) => new Date(s)),
  assigneeIds: z.array(z.number()).min(1),
});

// `status` is intentionally NOT part of the update schema: status changes
// MUST go through the dedicated /start, /review, /complete, /reject endpoints
// so the state machine, notifications, and sockets stay consistent.
const updateSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  deadline: z
    .string()
    .transform((s) => new Date(s))
    .optional(),
});

const commentSchema = z.object({
  message: z.string().min(1),
  attachmentUrl: z.string().optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(1),
});

const attachmentSchema = z.object({
  fileUrl: z.string().url(),
  fileName: z.string().optional(),
  fileType: z.string().optional(),
  fileSize: z.number().optional(),
});

export const tasksController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    
    const filters = {
      departmentId: req.query.departmentId ? parseInt(req.query.departmentId as string, 10) : undefined,
      status: req.query.status as TaskStatus | undefined,
      priority: req.query.priority as TaskPriority | undefined,
      assigneeId: req.query.assigneeId ? parseInt(req.query.assigneeId as string, 10) : undefined,
    };

    const tasks = await tasksService.list(filters, {
      userId: req.user.userId,
      role: req.user.role,
      departmentId: req.user.departmentId,
      organizationId: req.user.organizationId,
    });
    return ok(res, tasks);
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const id = parseInt(req.params.id, 10);
    const task = await tasksService.getById(id);
    if (!task) return notFound(res, 'Task not found');
    // Cross-tenant fence first — a hardened 404 leaks nothing about
    // existence of an id outside the caller's org.
    if (task.organizationId !== req.user.organizationId) {
      return notFound(res, 'Task not found');
    }
    if (!canAccessTask(task, req.user)) {
      return forbidden(res, 'Not authorized to view this task');
    }
    return ok(res, task);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);

    const data = createSchema.parse(req.body);

    // Team Leader can only create tasks in their own department
    if (req.user.role === 'team_leader' && data.departmentId !== req.user.departmentId) {
      return forbidden(res, 'Team Leaders can only assign tasks within their own department');
    }

    const task = await tasksService.create(data, req.user.userId, req.user.organizationId);
    return created(res, task, 'Task created');
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const id = parseInt(req.params.id, 10);
    const existing = await tasksService.getById(id);
    if (!existing) return notFound(res, 'Task not found');

    // Team leaders can only modify tasks that belong to their own department.
    // Admin and super_admin keep their existing broader scope (the route
    // middleware already filters out anyone below team_leader).
    if (req.user.role === 'team_leader' && existing.departmentId !== req.user.departmentId) {
      return forbidden(res, 'Team leaders can only edit tasks in their own department');
    }

    const data = updateSchema.parse(req.body);

    // Don't let anyone (other than super_admin) silently mutate a completed
    // task's deadline or fields — once a task is closed it shouldn't be
    // touched without explicit re-opening.
    if (existing.status === 'completed' && req.user.role !== 'super_admin') {
      return forbidden(res, 'This task is already completed and cannot be edited');
    }

    const task = await tasksService.update(id, data);
    return ok(res, task, 'Task updated');
  }),

  start: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const id = parseInt(req.params.id, 10);
    try {
      const task = await tasksService.startTask(
        id,
        req.user.userId,
        req.user.organizationId
      );
      return ok(res, task, 'Task started');
    } catch (err) {
      return badRequest(res, (err as Error).message);
    }
  }),

  complete: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const id = parseInt(req.params.id, 10);
    try {
      const task = await tasksService.completeTask(id, req.user);
      return ok(res, task, 'Task completed');
    } catch (err) {
      return badRequest(res, (err as Error).message);
    }
  }),

  review: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const id = parseInt(req.params.id, 10);
    try {
      const task = await tasksService.reviewTask(
        id,
        req.user.userId,
        req.user.organizationId
      );
      return ok(res, task, 'Task submitted for review');
    } catch (err) {
      return badRequest(res, (err as Error).message);
    }
  }),

  reject: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const id = parseInt(req.params.id, 10);
    const { reason } = rejectSchema.parse(req.body);
    try {
      const task = await tasksService.rejectTask(id, req.user, reason);
      return ok(res, task, 'Task sent back for changes');
    } catch (err) {
      return badRequest(res, (err as Error).message);
    }
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const id = parseInt(req.params.id, 10);
    const existing = await tasksService.getById(id);
    if (!existing) return notFound(res, 'Task not found');
    // A team leader can only delete tasks inside their own department.
    if (req.user.role === 'team_leader' && existing.departmentId !== req.user.departmentId) {
      return forbidden(res, 'Team leaders can only delete tasks in their own department');
    }
    await tasksService.delete(id);
    return ok(res, null, 'Task deleted');
  }),

  listComments: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const taskId = parseInt(req.params.id, 10);
    const task = await tasksService.getById(taskId);
    if (!task) return notFound(res, 'Task not found');
    if (!canAccessTask(task, req.user)) {
      return forbidden(res, 'Not authorized to view comments on this task');
    }
    const comments = await tasksService.getComments(taskId);
    return ok(res, comments);
  }),

  addComment: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const taskId = parseInt(req.params.id, 10);
    const task = await tasksService.getById(taskId);
    if (!task) return notFound(res, 'Task not found');
    if (!canAccessTask(task, req.user)) {
      return forbidden(res, 'Not authorized to comment on this task');
    }
    const { message, attachmentUrl } = commentSchema.parse(req.body);
    const comment = await tasksService.addComment(taskId, req.user.userId, message, attachmentUrl);
    return created(res, comment, 'Comment added');
  }),

  addAttachment: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) return unauthorized(res);
    const taskId = parseInt(req.params.id, 10);
    const task = await tasksService.getById(taskId);
    if (!task) return notFound(res, 'Task not found');
    if (!canAccessTask(task, req.user)) {
      return forbidden(res, 'Not authorized to add attachments to this task');
    }
    const data = attachmentSchema.parse(req.body);
    const attachment = await tasksService.addAttachment(taskId, req.user.userId, data);
    return created(res, attachment, 'Attachment added');
  }),
};
