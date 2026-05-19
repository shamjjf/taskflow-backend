-- Singleton organization settings row (id is always 1). The service layer
-- upserts on id=1 so the row is created on first read/write.

CREATE TABLE `organization_settings` (
  `id`           INT          NOT NULL DEFAULT 1,
  `company_name` VARCHAR(150) NOT NULL DEFAULT '',
  `time_zone`    VARCHAR(50)  NOT NULL DEFAULT 'ist',
  `updated_at`   DATETIME(3)  NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
