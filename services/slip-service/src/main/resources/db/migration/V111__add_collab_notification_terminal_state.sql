ALTER TABLE slip_collab_notification_outbox
    ADD COLUMN terminal_reason VARCHAR(100);

CREATE INDEX ix_slip_collab_notification_outbox_terminal
    ON slip_collab_notification_outbox (status, terminal_reason, created_at);
