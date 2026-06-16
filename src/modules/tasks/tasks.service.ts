import { prisma } from '@/config/prisma';
import { TaskStatus, TaskPriority, UserRole, NotificationType, ReferenceType } from '@prisma/client';
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

export interface CreateSelfTaskInput {
  title: string;
  description?: string;
  priority: TaskPriority;
  deadline: Date;
  // Informational: who the creator is reporting to. Used only to route the
  // creation notification — approval routing is derived by role (a team
  // leader's self-task is approved by an admin; everyone else's by their
  // department's team leader).
  reportToId?: number;
}

type Requester = {
  userId: number;
  role: UserRole;
  departmentId: number | null;
  organizationId: number;
};

// The role a self-assigning user reports UP to:
//   employee    -> their department's team leader
//   team_leader -> a Sub-Admin of the org
//   admin       -> the Super Admin of the org
function reportToRole(role: UserRole): UserRole | null {
  if (role === 'team_leader') return 'admin';
  if (role === 'admin') return 'super_admin';
  return null; // employee handled via department team leader
}

// Resolve who a self-assigned task "reports to" — i.e. who should be notified
// that they are the approver.
async function resolveReportToTargets(
  requester: { userId: number; role: UserRole; organizationId: number },
  department: { teamLeaderId: number | null } | null,
  reportToId?: number
): Promise<number[]> {
  const targetRole = reportToRole(requester.role);

  if (targetRole) {
    // Honour an explicitly selected manager when valid; otherwise fall back to
    // notifying every active user of the target tier in the org.
    if (reportToId) {
      const chosen = await prisma.user.findFirst({
        where: {
          id: reportToId,
          organizationId: requester.organizationId,
          role: targetRole,
          status: 'active',
        },
        select: { id: true },
      });
      if (chosen) return [chosen.id];
    }
    const targets = await prisma.user.findMany({
      where: { organizationId: requester.organizationId, role: targetRole, status: 'active' },
      select: { id: true },
    });
    return targets.map((t) => t.id);
  }

  // employee: report to the department team leader, but never notify themselves
  // if they happen to be the leader.
  if (department?.teamLeaderId && department.teamLeaderId !== requester.userId) {
    return [department.teamLeaderId];
  }
  return [];
}

// A Sub-Admin's self-assigned task is private: it has no department and must
// stay invisible to every other admin. This is true when the creator is an
// admin AND is among the assignees.
function isAdminSelfTask(task: {
  createdById: number;
  createdBy?: { role: UserRole } | null;
  assignees: Array<{ userId: number }>;
}): boolean {
  return (
    task.createdBy?.role === 'admin' &&
    task.assignees.some((a) => a.userId === task.createdById)
  );
}

// Mirror task lifecycle activity to the oversight tier. Normally that's the
// admin/super-admin tier (createForAdmins). But for a Sub-Admin's private
// self-task it must go to the org's Super Admin ONLY — never other admins.
async function notifyOversightTier(
  payload: {
    type: NotificationType;
    title: string;
    message: string;
    referenceType?: ReferenceType;
    referenceId?: number;
  },
  ctx: { organizationId: number; excludeUserId?: number; adminSelfTask: boolean }
) {
  if (ctx.adminSelfTask) {
    const supers = await prisma.user.findMany({
      where: { organizationId: ctx.organizationId, role: 'super_admin', status: 'active' },
      select: { id: true },
    });
    await Promise.all(
      supers
        .filter((s) => s.id !== ctx.excludeUserId)
        .map((s) => notificationsService.create({ userId: s.id, ...payload }))
    );
    return;
  }
  await notificationsService.createForAdmins(payload, { excludeUserId: ctx.excludeUserId });
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

  // The list of people the caller can report to when self-assigning a task:
  // a Sub-Admin reports to the org's Super Admin; a team leader reports to the
  // org's Sub-Admins; an employee reports to their own department's team leader.
  async getReportToOptions(requester: Requester) {
    const targetRole = reportToRole(requester.role);
    if (targetRole) {
      return prisma.user.findMany({
        where: { organizationId: requester.organizationId, role: targetRole, status: 'active' },
        select: { id: true, name: true, role: true, designation: true },
        orderBy: { name: 'asc' },
      });
    }

    if (!requester.departmentId) return [];
    const dept = await prisma.department.findFirst({
      where: { id: requester.departmentId, organizationId: requester.organizationId },
      include: {
        teamLeader: { select: { id: true, name: true, role: true, designation: true } },
      },
    });
    if (dept?.teamLeader && dept.teamLeader.id !== requester.userId) {
      return [dept.teamLeader];
    }
    return [];
  },

  // Self-assign: the caller creates a task assigned to themselves. The lifecycle
  // afterwards is identical to any other task — start -> in_review -> the
  // report-to person approves/rejects. The creator can never approve their own
  // task (see completeTask / rejectTask).
  //
  // Department handling: employees & team leaders self-assign inside their own
  // department. Sub-Admins have no department, so their self-task is created
  // with departmentId = null — that keeps it private to the creator + the org's
  // Super Admin (no team leader can ever see a department-less task).
  async createSelf(input: CreateSelfTaskInput, requester: Requester) {
    let departmentId: number | null = null;
    let department: { teamLeaderId: number | null } | null = null;

    if (requester.role !== 'admin') {
      if (!requester.departmentId) {
        throw new Error('You must belong to a department to self-assign a task');
      }
      const dept = await prisma.department.findUnique({
        where: { id: requester.departmentId },
      });
      if (!dept || dept.organizationId !== requester.organizationId) {
        throw new Error('Department not found');
      }
      departmentId = dept.id;
      department = { teamLeaderId: dept.teamLeaderId };
    }

    const task = await prisma.task.create({
      data: {
        organizationId: requester.organizationId,
        title: input.title,
        description: input.description,
        departmentId,
        priority: input.priority,
        deadline: input.deadline,
        createdById: requester.userId,
        assignees: { create: [{ userId: requester.userId }] },
      },
      include: taskInclude,
    });

    // Notify whoever this task reports to that they are the approver.
    const creator = await prisma.user.findUnique({
      where: { id: requester.userId },
      select: { name: true },
    });
    const creatorName = creator?.name || 'A team member';

    const reportToIds = await resolveReportToTargets(requester, department, input.reportToId);

    await Promise.all(
      reportToIds.map((userId) =>
        notificationsService.create({
          userId,
          type: 'task_assigned',
          title: 'New self-assigned task',
          message: `${creatorName} self-assigned "${task.title}" and is reporting to you. Deadline: ${task.deadline.toLocaleString()}`,
          referenceType: 'task',
          referenceId: task.id,
        })
      )
    );

    // Surface the new task to the assignee (self) + department room so the
    // team-tasks board and approver's queue update live.
    socketEvents.taskAssigned([requester.userId], task.departmentId, task);

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
        createdBy: { select: { role: true } },
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

    const adminSelfTask = isAdminSelfTask(task);

    // Notify Team Leader that the task has started
    const starter = await prisma.user.findUnique({ where: { id: userId } });
    if (task.department?.teamLeader && task.department.teamLeader.id !== userId) {
      await notificationsService.create({
        userId: task.department.teamLeader.id,
        type: 'task_started',
        title: 'Task started',
        message: `${starter?.name || 'A team member'} started working on "${task.title}"`,
        referenceType: 'task',
        referenceId: task.id,
      });
    }

    // Mirror to the oversight tier (excluding the requester themselves). For a
    // Sub-Admin's private self-task this routes to the Super Admin only.
    const startedWhere = task.department?.name ? ` in ${task.department.name}` : '';
    await notifyOversightTier(
      {
        type: 'task_started',
        title: 'Task started',
        message: `${starter?.name || 'A team member'} started working on "${task.title}"${startedWhere}`,
        referenceType: 'task',
        referenceId: task.id,
      },
      { organizationId, excludeUserId: userId, adminSelfTask }
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
        createdBy: { select: { role: true } },
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

    const adminSelfTask = isAdminSelfTask(task);

    // A Sub-Admin's self-task is approved by the Super Admin ONLY — never by
    // another admin (and never by the creator).
    if (adminSelfTask && requester.role !== 'super_admin') {
      throw new Error('Only the Super Admin can approve this task.');
    }

    // Self-assigned tasks must be approved by the reporting manager, not the
    // creator. A team leader is the leader of their own department, so without
    // this guard they could approve their own self-assigned task.
    const isAssignee = task.assignees.some((a) => a.userId === requester.userId);
    if (isAssignee && task.createdById === requester.userId && requester.role !== 'super_admin') {
      throw new Error(
        "You can't approve your own self-assigned task — it must be approved by your reporting manager."
      );
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
    if (task.department?.teamLeader && task.department.teamLeader.id !== requester.userId) {
      await notificationsService.create({
        userId: task.department.teamLeader.id,
        type: 'task_completed',
        title: 'Task completed',
        message: `${finisher?.name || 'A team member'} completed "${task.title}"`,
        referenceType: 'task',
        referenceId: task.id,
      });
    }

    // Mirror to the oversight tier (excluding the approver). For a Sub-Admin's
    // private self-task this routes to the Super Admin only.
    const completedWhere = task.department?.name ? ` in ${task.department.name}` : '';
    await notifyOversightTier(
      {
        type: 'task_completed',
        title: 'Task completed',
        message: `${finisher?.name || 'A team member'} completed "${task.title}"${completedWhere}`,
        referenceType: 'task',
        referenceId: task.id,
      },
      { organizationId: requester.organizationId, excludeUserId: requester.userId, adminSelfTask }
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
        createdBy: { select: { role: true } },
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

    const adminSelfTask = isAdminSelfTask(task);

    // A Sub-Admin's self-task is reviewed by the Super Admin ONLY.
    if (adminSelfTask && requester.role !== 'super_admin') {
      throw new Error('Only the Super Admin can review this task.');
    }

    // As with approval, a self-assigned task can't be reviewed by its own
    // creator — the reporting manager handles accept/reject.
    const isAssignee = task.assignees.some((a) => a.userId === requester.userId);
    if (isAssignee && task.createdById === requester.userId && requester.role !== 'super_admin') {
      throw new Error(
        "You can't review your own self-assigned task — it must be reviewed by your reporting manager."
      );
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

    // Also mirror to the oversight tier so they see review activity. For a
    // Sub-Admin's private self-task this routes to the Super Admin only.
    const rejectedWhere = task.department?.name ? ` in ${task.department.name}` : '';
    await notifyOversightTier(
      {
        type: 'task_review',
        title: 'Task sent back',
        message: `"${task.title}" was sent back${rejectedWhere}: ${reason}`,
        referenceType: 'task',
        referenceId: task.id,
      },
      { organizationId: requester.organizationId, excludeUserId: requester.userId, adminSelfTask }
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
        createdBy: { select: { role: true } },
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

    const adminSelfTask = isAdminSelfTask(task);

    // Notify Team Leader that the task is ready for review
    const submitter = await prisma.user.findUnique({ where: { id: userId } });
    if (task.department?.teamLeader && task.department.teamLeader.id !== userId) {
      await notificationsService.create({
        userId: task.department.teamLeader.id,
        type: 'task_review',
        title: 'Task submitted for review',
        message: `${submitter?.name || 'A team member'} submitted "${task.title}" for review`,
        referenceType: 'task',
        referenceId: task.id,
      });
    }

    // Mirror to the oversight tier (excluding the submitter). For a Sub-Admin's
    // private self-task this routes to the Super Admin only.
    const reviewWhere = task.department?.name ? ` in ${task.department.name}` : '';
    await notifyOversightTier(
      {
        type: 'task_review',
        title: 'Task submitted for review',
        message: `${submitter?.name || 'A team member'} submitted "${task.title}" for review${reviewWhere}`,
        referenceType: 'task',
        referenceId: task.id,
      },
      { organizationId, excludeUserId: userId, adminSelfTask }
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
