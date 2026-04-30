import { prisma } from '@/config/prisma';
import { TaskStatus, TaskPriority, UserRole } from '@prisma/client';

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
    requester: { userId: number; role: UserRole; departmentId: number | null }
  ) {
    const where: {
      AND: Array<Record<string, unknown>>;
    } = { AND: [] };

    if (requester.role === 'employee') {
      where.AND.push({
        assignees: { some: { userId: requester.userId } },
      });
    } else if (requester.role === 'team_leader') {
      if (requester.departmentId) {
        where.AND.push({ departmentId: requester.departmentId });
      }
    }

    if (filters.departmentId) where.AND.push({ departmentId: filters.departmentId });
    if (filters.status) where.AND.push({ status: filters.status });
    if (filters.priority) where.AND.push({ priority: filters.priority });
    if (filters.assigneeId) {
      where.AND.push({
        assignees: { some: { userId: filters.assigneeId } },
      });
    }

    const finalWhere = where.AND.length > 0 ? where : {};

    return prisma.task.findMany({
      where: finalWhere,
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

  async create(input: CreateTaskInput, createdById: number) {
    const task = await prisma.task.create({
      data: {
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

    // Notify each assignee about the new task
    await Promise.all(
      input.assigneeIds.map((userId) =>
        prisma.notification.create({
          data: {
            userId,
            type: 'task_assigned',
            title: 'New task assigned',
            message: `You have been assigned "${task.title}". Deadline: ${task.deadline.toLocaleString()}`,
            referenceType: 'task',
            referenceId: task.id,
          },
        })
      )
    );

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

  async startTask(id: number, userId: number) {
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignees: true,
        department: { include: { teamLeader: true } },
      },
    });
    if (!task) throw new Error('Task not found');

    const isAssigned = task.assignees.some((a) => a.userId === userId);
    if (!isAssigned) throw new Error('You are not assigned to this task');

    if (task.status === 'completed') {
      throw new Error('Task is already completed');
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
    if (task.department.teamLeader && task.department.teamLeader.id !== userId) {
      const starter = await prisma.user.findUnique({ where: { id: userId } });
      await prisma.notification.create({
        data: {
          userId: task.department.teamLeader.id,
          type: 'task_started',
          title: 'Task started',
          message: `${starter?.name || 'A team member'} started working on "${task.title}"`,
          referenceType: 'task',
          referenceId: task.id,
        },
      });
    }

    return updated;
  },

  async completeTask(id: number, userId: number) {
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        assignees: true,
        department: { include: { teamLeader: true } },
      },
    });
    if (!task) throw new Error('Task not found');

    const isAssigned = task.assignees.some((a) => a.userId === userId);
    if (!isAssigned) throw new Error('You are not assigned to this task');

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
    if (task.department.teamLeader && task.department.teamLeader.id !== userId) {
      const finisher = await prisma.user.findUnique({ where: { id: userId } });
      await prisma.notification.create({
        data: {
          userId: task.department.teamLeader.id,
          type: 'task_completed',
          title: 'Task completed',
          message: `${finisher?.name || 'A team member'} completed "${task.title}"`,
          referenceType: 'task',
          referenceId: task.id,
        },
      });
    }

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
