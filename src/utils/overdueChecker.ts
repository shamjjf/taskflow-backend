import { prisma } from '@/config/prisma';
import { notificationsService } from '@/modules/notifications/notifications.service';

/**
 * Checks for tasks past their deadline and:
 * 1. Flips status to 'overdue' for tasks the assignees haven't started yet
 *    (status === 'assigned'). Tasks already in progress keep their
 *    in_progress status — otherwise an active worker would see their task
 *    silently demoted back to "To Do" 5 minutes later, masking the work.
 *    The deadline-passed state is still shown visually via the
 *    "X days overdue" deadline label on the frontend.
 * 2. Sends a notification to the Team Leader of the department
 * 3. Sends a notification to each assignee
 */
export async function checkOverdueTasks(): Promise<void> {
  const now = new Date();

  // Find all tasks whose deadline has passed and are still active (not in
  // review and not completed). We notify for both assigned and in_progress
  // but only the assigned ones get their status flipped.
  const overdueTasks = await prisma.task.findMany({
    where: {
      deadline: { lt: now },
      status: { in: ['assigned', 'in_progress'] },
    },
    include: {
      assignees: { include: { user: true } },
      createdBy: { select: { role: true } },
      department: { include: { teamLeader: true } },
    },
  });

  if (overdueTasks.length === 0) return;

  console.log(`[Overdue Check] Found ${overdueTasks.length} overdue task(s) at ${now.toISOString()}`);

  for (const task of overdueTasks) {
    // 1. Flip to 'overdue' only when the task is still 'assigned'.
    if (task.status === 'assigned') {
      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'overdue' },
      });
    }

    // A Sub-Admin's self-task is private: its overdue alert must go to the
    // Super Admin only, never to other admins or a team leader.
    const adminSelfTask =
      task.createdBy?.role === 'admin' &&
      task.assignees.some((a) => a.userId === task.createdById);

    // 2. Notify Team Leader (if exists and not already notified for this overdue event)
    const teamLeader = task.department?.teamLeader;
    if (teamLeader) {
      const tlId = teamLeader.id;

      // Avoid duplicate overdue notification within last 24h for same task
      const existing = await prisma.notification.findFirst({
        where: {
          userId: tlId,
          type: 'task_overdue',
          referenceType: 'task',
          referenceId: task.id,
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      });

      if (!existing) {
        const assigneeNames = task.assignees.map((a) => a.user.name).join(', ');
        await prisma.notification.create({
          data: {
            userId: tlId,
            type: 'task_overdue',
            title: 'Task overdue',
            message: `"${task.title}" is overdue. Assigned to: ${assigneeNames}`,
            referenceType: 'task',
            referenceId: task.id,
          },
        });
      }
    }

    // Notify the oversight tier, once per task per 24h. For a normal task that's
    // the admin tier; for a Sub-Admin's private self-task it's the Super Admin
    // only (so other admins never see it).
    {
      const assigneeNames = task.assignees.map((a) => a.user.name).join(', ');
      const oversightRole = adminSelfTask ? 'super_admin' : 'admin';
      const existingForOversight = await prisma.notification.findFirst({
        where: {
          user: { role: oversightRole },
          type: 'task_overdue',
          referenceType: 'task',
          referenceId: task.id,
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      });

      if (!existingForOversight) {
        const where = task.department?.name ? ` in ${task.department.name}` : '';
        const payload = {
          type: 'task_overdue' as const,
          title: 'Task overdue',
          message: `"${task.title}" is overdue${where}. Assigned to: ${assigneeNames}`,
          referenceType: 'task' as const,
          referenceId: task.id,
        };
        if (adminSelfTask) {
          const supers = await prisma.user.findMany({
            where: { organizationId: task.organizationId, role: 'super_admin', status: 'active' },
            select: { id: true },
          });
          await Promise.all(
            supers.map((s) =>
              prisma.notification.create({
                data: { userId: s.id, organizationId: task.organizationId, ...payload },
              })
            )
          );
        } else {
          await notificationsService.createForAdmins(payload);
        }
      }
    }

    // 3. Notify each assignee
    for (const assignee of task.assignees) {
      const existing = await prisma.notification.findFirst({
        where: {
          userId: assignee.userId,
          type: 'task_overdue',
          referenceType: 'task',
          referenceId: task.id,
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      });

      if (!existing) {
        await prisma.notification.create({
          data: {
            userId: assignee.userId,
            type: 'task_overdue',
            title: 'Your task is overdue',
            message: `"${task.title}" deadline has passed. Please update your status or contact your Team Leader.`,
            referenceType: 'task',
            referenceId: task.id,
          },
        });
      }
    }
  }

  console.log(`[Overdue Check] Done. Updated ${overdueTasks.length} tasks.`);
}

/**
 * Starts the overdue checker — runs every 5 minutes.
 * Call this once during app startup.
 */
export function startOverdueChecker(intervalMinutes = 5): NodeJS.Timeout {
  // Run immediately on start
  checkOverdueTasks().catch((err) => {
    console.error('[Overdue Check] Initial run failed:', err);
  });

  // Then run on interval
  return setInterval(() => {
    checkOverdueTasks().catch((err) => {
      console.error('[Overdue Check] Periodic run failed:', err);
    });
  }, intervalMinutes * 60 * 1000);
}
