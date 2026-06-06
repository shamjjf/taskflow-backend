import { prisma } from '@/config/prisma';
import { TaskStatus, TaskPriority, UserRole } from '@prisma/client';
import { socketEvents } from '@/sockets';
import { notificationsService } from '@/modules/notifications/notifications.service';

export interface TasksFilters {
  departmentId?: number;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: number;
  myTasks?: boolean;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  departmentId: number;
  priority: TaskPriority;
  deadline: Date;
  assigneeIds: number[];
}

const taskInclude = {
  createdBy: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  assignees: {
    include: {
      user: { select: { id: true, name: true } },
    },
  },
  _count: { select: { comments: true, attachments: true } },
};

export const tasksService = {
  async list(
    filters: TasksFilters,
    requester: { userId: number; role: UserRole; departmentId: number | null; organizationId: number }
  ) {
    const where: {
      AND: Array<Record<string, unknown>>;
    } = { AND: [{ organizationId: requester.organizationId }] };

    if (requester.role === 'employee') {
      where.AND.push({
        assignees: { some: { userId: requester.userId } },
      });
    } else if (requester.role === 'team_leader') {
      if (requester.departmentId) {
        where.AND.push({ departmentId: requester.departmentId });
      }
    } else if (requester.role === 'admin') {
      // Admin sees tasks org-wide except those created by *other* admins or the super admin.
      // The admin's own tasks must remain visible to them.
      where.AND.push({
        OR: [
          { createdBy: { role: { notIn: ['admin', 'super_admin'] } } },
          { createdById: requester.userId },
        ],
      });
    }

    if (filters.departmentId) where.AND.push({ departmentId: filters.departmentId });
    if (filters.status) where.AND.push({ status: filters.status });
    if (filters.priority) where.AND.push({ priority: filters.priority });
    if (filters.assigneeId) {
      where.AND.push({
        assignees: { some: { userId: filters.assigneeId } },
      });
    }

    return prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: [{ priority: 'desc' }, { deadline: 'asc' }],
    });
  },

  async getById(id: number) {
    return prisma.task.findUnique({
      where: { id },
      include: {
        ...taskInclude,
        comments: {
          include: {
            user: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        attachments: true,
      },
    });
  },

  async create(input: CreateTaskInput, createdById: number, organizationId: number) {
    const task = await prisma.task.create({
      data: {
        organizationId,
        title: input.title,
        description: input.description,
        departmentId: input.departmentId,
        priority: input.priority,
        deadline: input.deadline,
        createdById,
        assignees: {
          create: input.assigneeIds.map((userId) => ({ userId })),
        },
      },
      include: taskInclude,
    });

    // Notify each assignee about the new task (auto-emits socket via service)
    await Promise.all(
      input.assigneeIds.map((userId) =>
        notificationsService.create({
          userId,
          type: 'task_assigned',
          title: 'New task assigned',
          message: `You have been assigned "${task.title}". Deadline: ${task.deadline.toLocaleString()}`,
          referenceType: 'task',
          referenceId: task.id,
        })
      )
    );

    // Mirror to admin tier so they see new task activity in their bell.
    await notificationsService.createForAdmins(
      {
        type: 'task_assigned',
        title: 'New task assigned',
        message: `"${task.title}" was assigned in ${task.department?.name || 'a department'}`,
        referenceType: 'task',
        referenceId: task.id,
      },
      { excludeUserId: createdById }
    );

    socketEvents.taskAssigned(input.assigneeIds, task.departmentId, task);

    return task;
  },

  async update(
    id: number,
    data: {
      title?: string;
      description?: string;
      priority?: TaskPriority;
      deadline?: Date;
      status?: TaskStatus;
    }
  ) {
    return prisma.task.update({
      where: { id },
      data,
      include: taskInclude,
    });
  },

  async startTask(id: number, userId: number, organizationId: number) {
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignees: true,
        department: { include: { teamLeader: true } },
      },
    });
    if (!task) throw new Error('Task not found');
    // Cross-tenant fence: surface a not-found rather than auth error so
    // attackers can't probe ids that exist in other orgs.
    if (task.organizationId !== organizationId) throw new Error('Task not found');

    const isAssigned = task.assignees.some((a) => a.userId === userId);
    if (!isAssigned) throw new Error('You are not assigned to this task');

    // Whitelist source states: a task can only be (re)started from a state
    // where work hasn't begun or has stalled. Allowing /start from `in_review`
    // would silently regress a task out of the team leader's review queue.
    if (task.status !== 'assigned' && task.status !== 'overdue') {
      throw new Error('Task can only be started from the assigned or overdue state');
    }

    const updated = await prisma.task.update({
      where: { id },
      data: {
        status: 'in_progress',
        startedAt: task.startedAt || new Date(),
      },
      include: taskInclude,
    });

    // Notify Team Leader that the task has started
    const starter = await prisma.user.findUnique({ where: { id: userId } });
    if (task.department.teamLeader && task.department.teamLeader.id !== userId) {
      await notificationsService.create({
        userId: task.department.teamLeader.id,
        type: 'task_started',
        title: 'Task started',
        message: `${starter?.name || 'A team member'} started working on "${task.title}"`,
        referenceType: 'task',
        referenceId: task.id,
      });
    }

    // Mirror to admin tier (excluding the requester themselves)
    await notificationsService.createForAdmins(
      {
        type: 'task_started',
        title: 'Task started',
        message: `${starter?.name || 'A team member'} started working on "${task.title}" in ${task.department.name}`,
        referenceType: 'task',
        referenceId: task.id,
      },
      { excludeUserId: userId }
    );

    socketEvents.taskStarted(
      updated.id,
      updated.departmentId,
      task.assignees.map((a) => a.userId),
      updated
    );

    return updated;
  },

  async completeTask(
    id: number,
    requester: { userId: number; role: UserRole; departmentId: number | null; organizationId: number }
  ) {
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignees: true,
        department: { include: { teamLeader: true } },
      },
    });
    if (!task) throw new Error('Task not found');
    if (task.organizationId !== requester.organizationId) throw new Error('Task not found');

    const isTeamLeaderOfDept =
      requester.role === 'team_leader' && requester.departmentId === task.departmentId;
    const isAdminOrAbove = requester.role === 'admin' || requester.role === 'super_admin';
    if (!isTeamLeaderOfDept && !isAdminOrAbove) {
      throw new Error('Only the team leader of this department can approve this task');
    }

    if (task.status === 'completed') {
      throw new Error('Task is already completed');
    }

    const updated = await prisma.task.update({
      where: { id },
      data: {
        status: 'completed',
        completedAt: new Date(),
      },
      include: taskInclude,
    });

    // Notify Team Leader that the task is complete
    const finisher = await prisma.user.findUnique({ where: { id: requester.userId } });
    if (task.department.teamLeader && task.department.teamLeader.id !== requester.userId) {
      await notificationsService.create({
        userId: task.department.teamLeader.id,
        type: 'task_completed',
        title: 'Task completed',
        message: `${finisher?.name || 'A team member'} completed "${task.title}"`,
        referenceType: 'task',
        referenceId: task.id,
      });
    }

    // Mirror to admin tier (excluding the approver themselves)
    await notificationsService.createForAdmins(
      {
        type: 'task_completed',
        title: 'Task completed',
        message: `${finisher?.name || 'A team member'} completed "${task.title}" in ${task.department.name}`,
        referenceType: 'task',
        referenceId: task.id,
      },
      { excludeUserId: requester.userId }
    );

    socketEvents.taskCompleted(
      updated.id,
      updated.departmentId,
      task.assignees.map((a) => a.userId),
      updated
    );

    return updated;
  },

  async rejectTask(
    id: number,
    requester: { userId: number; role: UserRole; departmentId: number | null; organizationId: number },
    reason: string
  ) {
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignees: true,
        department: { include: { teamLeader: true } },
      },
    });
    if (!task) throw new Error('Task not found');
    if (task.organizationId !== requester.organizationId) throw new Error('Task not found');

    const isTeamLeaderOfDept =
      requester.role === 'team_leader' && requester.departmentId === task.departmentId;
    const isAdminOrAbove = requester.role === 'admin' || requester.role === 'super_admin';
    if (!isTeamLeaderOfDept && !isAdminOrAbove) {
      throw new Error('Only the team leader of this department can reject this task');
    }

    if (task.status !== 'in_review') {
      throw new Error('Only tasks in review can be rejected');
    }

    const updated = await prisma.task.update({
      where: { id },
      data: {
        status: 'in_progress',
        completedAt: null,
      },
      include: taskInclude,
    });

    await prisma.taskComment.create({
      data: {
        taskId: id,
        userId: requester.userId,
        message: `Sent back for changes: ${reason}`,
      },
    });

    await Promise.all(
      task.assignees.map((a) =>
        notificationsService.create({
          userId: a.userId,
          type: 'task_review',
          title: 'Task sent back',
          message: `"${task.title}" was sent back: ${reason}`,
          referenceType: 'task',
          referenceId: task.id,
        })
      )
    );

    // Also mirror to admin tier so they see review activity in their bell.
    await notificationsService.createForAdmins(
      {
        type: 'task_review',
        title: 'Task sent back',
        message: `"${task.title}" was sent back in ${task.department.name}: ${reason}`,
        referenceType: 'task',
        referenceId: task.id,
      },
      { excludeUserId: requester.userId }
    );

    socketEvents.taskRejected(
      updated.id,
      updated.departmentId,
      task.assignees.map((a) => a.userId),
      updated
    );

    return updated;
  },

  async reviewTask(id: number, userId: number, organizationId: number) {
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignees: true,
        department: { include: { teamLeader: true } },
      },
    });

    if (!task) throw new Error('Task not found');
    if (task.organizationId !== organizationId) throw new Error('Task not found');

    const isAssigned = task.assignees.some((a) => a.userId === userId);
    if (!isAssigned) throw new Error('You are not assigned to this task');

    // Only an in-progress (or overdue, since the user is finishing late) task
    // can be submitted for review. Without this guard an `assigned` task could
    // jump straight to `in_review` without ever being started, and an already
    // submitted task could be re-submitted, firing duplicate notifications.
    if (task.status !== 'in_progress' && task.status !== 'overdue') {
      throw new Error('Only in-progress tasks can be submitted for review');
    }

    const updated = await prisma.task.update({
      where: { id },
      // Don't stamp completedAt here — the task is only submitted, not
      // approved. completedAt is reserved for the final TL approval so
      // analytics/reports filtering by completedAt remain meaningful.
      data: {
        status: 'in_review',
      },
      include: taskInclude,
    });

    // Notify Team Leader that the task is ready for review
    const submitter = await prisma.user.findUnique({ where: { id: userId } });
    if (task.department.teamLeader && task.department.teamLeader.id !== userId) {
      await notificationsService.create({
        userId: task.department.teamLeader.id,
        type: 'task_review',
        title: 'Task submitted for review',
        message: `${submitter?.name || 'A team member'} submitted "${task.title}" for review`,
        referenceType: 'task',
        referenceId: task.id,
      });
    }

    // Mirror to admin tier (excluding the submitter)
    await notificationsService.createForAdmins(
      {
        type: 'task_review',
        title: 'Task submitted for review',
        message: `${submitter?.name || 'A team member'} submitted "${task.title}" for review in ${task.department.name}`,
        referenceType: 'task',
        referenceId: task.id,
      },
      { excludeUserId: userId }
    );

    socketEvents.taskReviewed(
      updated.id,
      updated.departmentId,
      task.assignees.map((a) => a.userId),
      updated
    );

    return updated;
  },

  async delete(id: number) {
    return prisma.task.delete({ where: { id } });
  },

  async addComment(taskId: number, userId: number, message: string, attachmentUrl?: string) {
    return prisma.taskComment.create({
      data: { taskId, userId, message, attachmentUrl },
      include: { user: { select: { id: true, name: true } } },
    });
  },

  async getComments(taskId: number) {
    return prisma.taskComment.findMany({
      where: { taskId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  },

  async addAttachment(
    taskId: number,
    uploadedById: number,
    data: { fileUrl: string; fileName?: string; fileType?: string; fileSize?: number }
  ) {
    return prisma.taskAttachment.create({
      data: { taskId, uploadedById, ...data },
    });
  },
};
