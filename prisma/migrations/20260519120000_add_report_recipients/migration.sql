-- Additional email addresses that receive automated daily/weekly report emails.
-- Managed by Super Admin from the Settings page; these are appended to the
-- admin / super_admin recipient set the report jobs already build.

CREATE TABLE `report_recipients` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `email`      VARCHAR(150) NOT NULL,
  `label`      VARCHAR(150) NULL,
  `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3)  NOT NULL,

  UNIQUE INDEX `report_recipients_email_key` (`email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
