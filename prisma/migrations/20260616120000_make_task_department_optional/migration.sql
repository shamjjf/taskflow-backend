-- AlterTable: a Sub-Admin's self-assigned task belongs to no department, so
-- tasks.department_id must allow NULL. The existing foreign key still permits
-- NULL values, so only the column nullability changes.
ALTER TABLE `tasks` MODIFY `department_id` INTEGER NULL;
