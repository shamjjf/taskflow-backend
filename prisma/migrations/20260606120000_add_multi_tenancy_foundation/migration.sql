-- =====================================================================
-- Multi-tenancy foundation
--
-- Adds an `organizations` table and an `organization_id` column to every
-- tenant-scoped table. Existing rows are backfilled to the default org
-- (id=1, slug='jjfindia') so the current single-tenant deployment keeps
-- working unchanged after this migration is applied.
--
-- After this migration runs, the schema is ready to host multiple orgs
-- side-by-side, but the application code still treats everything as one
-- tenant. Phase 2 (a follow-up migration / code drop) wires the backend
-- and frontends to actually scope queries by organization_id.
-- =====================================================================

-- Step 1: Create the organizations table
CREATE TABLE `organizations` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `slug` VARCHAR(50) NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `organizations_slug_key`(`slug`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Step 2: Seed the default organization. id=1 is reserved for JJF India so
-- the backfill default lines up with every existing row.
INSERT INTO `organizations` (`id`, `slug`, `name`, `status`, `created_at`, `updated_at`)
VALUES (1, 'jjfindia', 'JJF India', 'active', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

-- =====================================================================
-- Step 3: Add organization_id to every tenant-scoped table.
-- The column is added WITH DEFAULT 1 so existing rows backfill atomically
-- to JJF India. We keep the default at the schema level too (mirrored in
-- prisma/schema.prisma) so older creation code paths that don't know
-- about organization_id continue to work.
-- =====================================================================

ALTER TABLE `users`
  ADD COLUMN `organization_id` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `departments`
  ADD COLUMN `organization_id` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `tasks`
  ADD COLUMN `organization_id` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `reports`
  ADD COLUMN `organization_id` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `conversations`
  ADD COLUMN `organization_id` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `notifications`
  ADD COLUMN `organization_id` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `activity_logs`
  ADD COLUMN `organization_id` INTEGER NOT NULL DEFAULT 1;

ALTER TABLE `report_recipients`
  ADD COLUMN `organization_id` INTEGER NOT NULL DEFAULT 1;

-- =====================================================================
-- Step 4: Drop old single-tenant unique constraints and replace with
-- composite (column, organization_id) variants so two orgs can each have
-- a user with the same email, a department with the same name, etc.
-- =====================================================================

ALTER TABLE `users` DROP INDEX `users_email_key`;
CREATE UNIQUE INDEX `users_email_organization_id_key` ON `users`(`email`, `organization_id`);

ALTER TABLE `departments` DROP INDEX `departments_name_key`;
CREATE UNIQUE INDEX `departments_name_organization_id_key` ON `departments`(`name`, `organization_id`);

ALTER TABLE `report_recipients` DROP INDEX `report_recipients_email_key`;
CREATE UNIQUE INDEX `report_recipients_email_organization_id_key` ON `report_recipients`(`email`, `organization_id`);

-- =====================================================================
-- Step 5: Add per-tenant secondary indexes so the org-scoped lookups
-- introduced in Phase 2 don't full-scan large tables.
-- =====================================================================

CREATE INDEX `users_organization_id_idx` ON `users`(`organization_id`);
CREATE INDEX `departments_organization_id_idx` ON `departments`(`organization_id`);
CREATE INDEX `tasks_organization_id_idx` ON `tasks`(`organization_id`);
CREATE INDEX `reports_organization_id_idx` ON `reports`(`organization_id`);
CREATE INDEX `conversations_organization_id_idx` ON `conversations`(`organization_id`);
CREATE INDEX `notifications_organization_id_idx` ON `notifications`(`organization_id`);
CREATE INDEX `activity_logs_organization_id_idx` ON `activity_logs`(`organization_id`);
CREATE INDEX `report_recipients_organization_id_idx` ON `report_recipients`(`organization_id`);

-- =====================================================================
-- Step 6: Foreign keys back to organizations. RESTRICT on delete so an
-- organization with existing data can never be silently wiped.
-- =====================================================================

ALTER TABLE `users`
  ADD CONSTRAINT `users_organization_id_fkey`
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `departments`
  ADD CONSTRAINT `departments_organization_id_fkey`
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `tasks`
  ADD CONSTRAINT `tasks_organization_id_fkey`
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `reports`
  ADD CONSTRAINT `reports_organization_id_fkey`
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `conversations`
  ADD CONSTRAINT `conversations_organization_id_fkey`
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `notifications`
  ADD CONSTRAINT `notifications_organization_id_fkey`
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `activity_logs`
  ADD CONSTRAINT `activity_logs_organization_id_fkey`
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `report_recipients`
  ADD CONSTRAINT `report_recipients_organization_id_fkey`
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- =====================================================================
-- Step 7: Convert organization_settings from a singleton row (id always 1)
-- into a per-tenant table keyed by organization_id. The existing row
-- becomes the JJF India settings row.
-- =====================================================================

-- Drop the PK so we can rename the column without conflict
ALTER TABLE `organization_settings` DROP PRIMARY KEY;

-- Rename `id` (always 1) to `organization_id`
ALTER TABLE `organization_settings`
  CHANGE COLUMN `id` `organization_id` INTEGER NOT NULL;

-- Re-add PK on the renamed column
ALTER TABLE `organization_settings` ADD PRIMARY KEY (`organization_id`);

-- FK so settings row is auto-removed if its org is deleted
ALTER TABLE `organization_settings`
  ADD CONSTRAINT `organization_settings_organization_id_fkey`
  FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
