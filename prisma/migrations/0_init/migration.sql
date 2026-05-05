-- CreateTable
CREATE TABLE `departments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `description` TEXT NULL,
    `team_leader_id` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `departments_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(150) NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('super_admin', 'admin', 'team_leader', 'employee') NOT NULL,
    `department_id` INTEGER NULL,
    `designation` VARCHAR(100) NULL,
    `profile_image` VARCHAR(255) NULL,
    `phone` VARCHAR(20) NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `last_login_at` DATETIME(3) NULL,
    `refresh_token` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_role_idx`(`role`),
    INDEX `users_department_id_idx`(`department_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tasks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `created_by` INTEGER NOT NULL,
    `department_id` INTEGER NOT NULL,
    `priority` ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
    `status` ENUM('assigned', 'in_progress', 'in_review', 'completed', 'overdue') NOT NULL DEFAULT 'assigned',
    `deadline` DATETIME(3) NOT NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `tasks_status_idx`(`status`),
    INDEX `tasks_deadline_idx`(`deadline`),
    INDEX `tasks_department_id_status_idx`(`department_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_assignees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `task_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `individual_status` ENUM('assigned', 'in_progress', 'in_review', 'completed', 'overdue') NOT NULL DEFAULT 'assigned',
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `task_assignees_task_id_user_id_key`(`task_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_attachments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `task_id` INTEGER NOT NULL,
    `uploaded_by` INTEGER NOT NULL,
    `file_url` VARCHAR(500) NOT NULL,
    `file_name` VARCHAR(255) NULL,
    `file_type` VARCHAR(50) NULL,
    `file_size` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `task_comments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `task_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `message` TEXT NOT NULL,
    `attachment_url` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `task_comments_task_id_idx`(`task_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `task_id` INTEGER NULL,
    `report_type` ENUM('daily', 'weekly', 'task') NOT NULL,
    `description` TEXT NOT NULL,
    `attachment_url` VARCHAR(500) NULL,
    `report_date` DATE NOT NULL,
    `approval_status` ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    `reviewed_by` INTEGER NULL,
    `reviewed_at` DATETIME(3) NULL,
    `review_comment` TEXT NULL,
    `visible_to_super_admin` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `reports_approval_status_idx`(`approval_status`),
    INDEX `reports_user_id_report_date_idx`(`user_id`, `report_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('direct', 'group') NOT NULL,
    `name` VARCHAR(150) NULL,
    `department_id` INTEGER NULL,
    `created_by` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversation_participants` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversation_id` INTEGER NOT NULL,
    `user_id` INTEGER NOT NULL,
    `joined_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_read_at` DATETIME(3) NULL,

    UNIQUE INDEX `conversation_participants_conversation_id_user_id_key`(`conversation_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `messages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversation_id` INTEGER NOT NULL,
    `sender_id` INTEGER NOT NULL,
    `message` TEXT NOT NULL,
    `attachment_url` VARCHAR(500) NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `messages_conversation_id_created_at_idx`(`conversation_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `type` ENUM('task_assigned', 'task_started', 'task_completed', 'task_overdue', 'deadline_near', 'report_submitted', 'report_approved', 'report_rejected', 'message_new', 'comment_new', 'system') NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `message` TEXT NOT NULL,
    `reference_type` ENUM('task', 'report', 'message', 'system') NULL,
    `reference_id` INTEGER NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_user_id_is_read_idx`(`user_id`, `is_read`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `activity_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `entity_type` VARCHAR(50) NULL,
    `entity_id` INTEGER NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_team_leader_id_fkey` FOREIGN KEY (`team_leader_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_assignees` ADD CONSTRAINT `task_assignees_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_assignees` ADD CONSTRAINT `task_assignees_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_attachments` ADD CONSTRAINT `task_attachments_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_attachments` ADD CONSTRAINT `task_attachments_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_comments` ADD CONSTRAINT `task_comments_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task_comments` ADD CONSTRAINT `task_comments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversations` ADD CONSTRAINT `conversations_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversation_participants` ADD CONSTRAINT `conversation_participants_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `conversation_participants` ADD CONSTRAINT `conversation_participants_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `messages` ADD CONSTRAINT `messages_sender_id_fkey` FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

