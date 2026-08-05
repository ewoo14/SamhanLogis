CREATE TABLE slip_collab_notification_outbox (
    id UUID PRIMARY KEY, slip_id UUID NOT NULL, editor_id UUID NOT NULL,
    raw_recipient VARCHAR(255) NOT NULL, subject VARCHAR(200) NOT NULL,
    body VARCHAR(2000) NOT NULL, fingerprint VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMP NOT NULL, created_at TIMESTAMP NOT NULL,
    created_by VARCHAR(50) NOT NULL, modified_at TIMESTAMP, modified_by VARCHAR(50),
    deleted_at TIMESTAMP, deleted_by VARCHAR(50), is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX ix_slip_collab_notification_outbox_pending
    ON slip_collab_notification_outbox (status, next_attempt_at, created_at);
