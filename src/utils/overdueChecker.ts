import { prisma } from '@/config/prisma';

/**
 * Checks for tasks past their deadline and:
 * 1. Updates their status to 'overdue' (if not already completed)
 * 2. Sends a notification to the Team Leader of the department
 * 3. Sends a notification to each assignee
 */
export async function checkOverdueTasks(): Promise<void> {
  const now = new Date();

  // Find all tasks whose deadline has passed and are still active (not completed)
  const overdueTasks = await prisma.task.findMany({
    where: {
      deadline: { lt: now },
      status: { in: ['assigned', 'in_progress'] },
    },
    include: {
      assignees: { include: { user: true } },
      department: { include: { teamLeader: true } },
    },
  });

  if (overdueTasks.length === 0) return;

  console.log(`[Overdue Check] Found ${overdueTasks.length} overdue task(s) at ${now.toISOString()}`);

  for (const task of overdueTasks) {
    // 1. Update status to overdue
    await prisma.task.update({
      where: { id: task.id },
      data: { status: 'overdue' },
    });

    // 2. Notify Team Leader (if exists and not already notified for this overdue event)
    if (task.department.teamLeader) {
      const tlId = task.department.teamLeader.id;

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
