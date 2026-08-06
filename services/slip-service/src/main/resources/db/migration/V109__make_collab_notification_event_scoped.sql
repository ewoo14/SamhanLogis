ALTER TABLE slip_collab_notification_outbox
    ADD COLUMN event_id UUID;

UPDATE slip_collab_notification_outbox
   SET event_id = id
 WHERE event_id IS NULL;

ALTER TABLE slip_collab_notification_outbox
    ALTER COLUMN event_id SET NOT NULL;

ALTER TABLE slip_collab_notification_outbox
    DROP CONSTRAINT IF EXISTS slip_collab_notification_outbox_fingerprint_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_slip_collab_notification_outbox_event_recipient
    ON slip_collab_notification_outbox (event_id, raw_recipient);
