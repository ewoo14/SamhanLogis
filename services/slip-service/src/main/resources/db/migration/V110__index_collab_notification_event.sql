CREATE INDEX IF NOT EXISTS ix_slip_collab_notification_outbox_event
    ON slip_collab_notification_outbox (event_id, created_at);
