-- AlterTable
ALTER TABLE `notifications` MODIFY `type` ENUM('task_assigned', 'task_started', 'task_completed', 'task_overdue', 'task_review', 'deadline_near', 'report_submitted', 'report_approved', 'report_rejected', 'message_new', 'comment_new', 'system') NOT NULL;
