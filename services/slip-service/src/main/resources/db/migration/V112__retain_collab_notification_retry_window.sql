ALTER TABLE slip_collab_notification_outbox
    ADD COLUMN slip_no VARCHAR(100),
    ADD COLUMN retry_started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX ix_slip_collab_notification_terminal_created
    ON slip_collab_notification_outbox (status, created_at);
