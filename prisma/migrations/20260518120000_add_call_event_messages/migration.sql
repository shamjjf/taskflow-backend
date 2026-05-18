-- AlterTable
ALTER TABLE `messages`
  ADD COLUMN `message_type` ENUM('text', 'call_event') NOT NULL DEFAULT 'text',
  ADD COLUMN `call_event_data` JSON NULL;
