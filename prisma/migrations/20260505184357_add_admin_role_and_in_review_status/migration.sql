-- AlterTable
ALTER TABLE `task_assignees` MODIFY `individual_status` ENUM('assigned', 'in_progress', 'in_review', 'completed', 'overdue') NOT NULL DEFAULT 'assigned';

-- AlterTable
ALTER TABLE `tasks` MODIFY `status` ENUM('assigned', 'in_progress', 'in_review', 'completed', 'overdue') NOT NULL DEFAULT 'assigned';

-- AlterTable
ALTER TABLE `users` MODIFY `role` ENUM('super_admin', 'admin', 'team_leader', 'employee') NOT NULL;
