-- RenameIndex
ALTER TABLE `conversations` RENAME INDEX `idx_conversations_department_id_is_auto` TO `conversations_department_id_is_auto_department_group_idx`;
