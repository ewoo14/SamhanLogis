-- E2 estimate list strikethrough restore.
-- deleted_by keeps the audit userId; deleted_by_name stores the non-UUID display name for UI badges.

ALTER TABLE estimates
    ADD COLUMN IF NOT EXISTS deleted_by_name VARCHAR(100);
