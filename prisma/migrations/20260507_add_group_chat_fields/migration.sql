-- AddColumn isAutoDepartmentGroup to conversations
ALTER TABLE `conversations` ADD COLUMN `is_auto_department_group` BOOLEAN NOT NULL DEFAULT false AFTER `department_id`;

-- Create index on department_id and isAutoDepartmentGroup for faster queries
CREATE INDEX `idx_conversations_department_id_is_auto` ON `conversations`(`department_id`, `is_auto_department_group`);
