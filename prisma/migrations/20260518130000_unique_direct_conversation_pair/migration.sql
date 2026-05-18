-- Enforce a single direct (1:1) conversation per pair of users.
--
-- Approach: add a canonical (a, b) pair column on `conversations` where
-- a = MIN(userId), b = MAX(userId). Both columns are NULL for group chats.
-- A UNIQUE index on (direct_user_a_id, direct_user_b_id) then guarantees
-- one row per pair at the database level. MySQL InnoDB treats NULL as
-- distinct in unique indexes, so group rows ((NULL, NULL)) coexist freely.
--
-- Existing duplicate direct conversations are merged into the OLDEST
-- conversation for each pair (lowest id wins). Messages from the
-- duplicates are reassigned to the kept conversation; participants'
-- last_read_at is folded into the kept row via GREATEST.

-- ---------------------------------------------------------------------------
-- 1. Add the canonical pair columns (nullable for groups).
-- ---------------------------------------------------------------------------
ALTER TABLE `conversations`
  ADD COLUMN `direct_user_a_id` INT NULL,
  ADD COLUMN `direct_user_b_id` INT NULL;

-- ---------------------------------------------------------------------------
-- 2. Backfill the pair columns for every existing direct conversation that
--    has exactly two participants. Conversations with malformed participant
--    counts (0, 1, or >2 for a `direct` row) are left untouched and will be
--    excluded from the unique-pair index by their NULL values — surface
--    them later via a separate audit if needed.
-- ---------------------------------------------------------------------------
UPDATE `conversations` c
JOIN (
  SELECT
    cp.conversation_id,
    MIN(cp.user_id) AS user_a,
    MAX(cp.user_id) AS user_b,
    COUNT(*)        AS participant_count
  FROM `conversation_participants` cp
  GROUP BY cp.conversation_id
) p ON p.conversation_id = c.id
SET
  c.direct_user_a_id = p.user_a,
  c.direct_user_b_id = p.user_b
WHERE c.type = 'direct'
  AND p.participant_count = 2
  AND p.user_a <> p.user_b;

-- ---------------------------------------------------------------------------
-- 3. Merge duplicate direct conversations into the oldest one for each pair.
-- ---------------------------------------------------------------------------

-- 3a. Map every duplicate conversation_id -> the kept (lowest-id) one.
DROP TEMPORARY TABLE IF EXISTS `_dup_conv_map`;
CREATE TEMPORARY TABLE `_dup_conv_map` (
  dup_id  INT NOT NULL PRIMARY KEY,
  keep_id INT NOT NULL,
  INDEX (keep_id)
);

INSERT INTO `_dup_conv_map` (dup_id, keep_id)
SELECT
  c.id AS dup_id,
  pair_min.min_id AS keep_id
FROM `conversations` c
JOIN (
  SELECT direct_user_a_id, direct_user_b_id, MIN(id) AS min_id
  FROM `conversations`
  WHERE type = 'direct'
    AND direct_user_a_id IS NOT NULL
    AND direct_user_b_id IS NOT NULL
  GROUP BY direct_user_a_id, direct_user_b_id
  HAVING COUNT(*) > 1
) pair_min
  ON pair_min.direct_user_a_id = c.direct_user_a_id
 AND pair_min.direct_user_b_id = c.direct_user_b_id
WHERE c.type = 'direct'
  AND c.id <> pair_min.min_id;

-- 3b. Move messages from each duplicate to its kept conversation.
UPDATE `messages` m
JOIN `_dup_conv_map` d ON d.dup_id = m.conversation_id
SET m.conversation_id = d.keep_id;

-- 3c. Fold the duplicate participants' last_read_at into the kept row
--     (take the most recent read timestamp across all duplicates).
UPDATE `conversation_participants` kept
JOIN `_dup_conv_map` d ON d.keep_id = kept.conversation_id
JOIN `conversation_participants` dup
  ON dup.conversation_id = d.dup_id
 AND dup.user_id = kept.user_id
SET kept.last_read_at = CASE
  WHEN kept.last_read_at IS NULL THEN dup.last_read_at
  WHEN dup.last_read_at  IS NULL THEN kept.last_read_at
  WHEN dup.last_read_at > kept.last_read_at THEN dup.last_read_at
  ELSE kept.last_read_at
END;

-- 3d. Delete the duplicate conversations. ON DELETE CASCADE on the
--     participant and message FKs cleans up the now-orphaned participant
--     rows (messages were already moved in 3b).
DELETE c FROM `conversations` c
JOIN `_dup_conv_map` d ON d.dup_id = c.id;

DROP TEMPORARY TABLE `_dup_conv_map`;

-- ---------------------------------------------------------------------------
-- 4. Add the unique index that enforces one direct conversation per pair.
--    NULL pairs (group conversations) are excluded because MySQL treats
--    NULL values as distinct in unique indexes.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX `conversations_direct_user_a_id_direct_user_b_id_key`
  ON `conversations` (`direct_user_a_id`, `direct_user_b_id`);
