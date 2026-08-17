ALTER TABLE partner_order_drafts
    ALTER COLUMN expires_at DROP NOT NULL;

UPDATE partner_order_drafts
SET expires_at = NULL
WHERE is_deleted = FALSE;
