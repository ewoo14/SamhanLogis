ALTER TABLE notification_requests
    ADD COLUMN idempotency_key VARCHAR(100);

CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_requests_idempotency_key
    ON notification_requests (idempotency_key)
 WHERE idempotency_key IS NOT NULL AND is_deleted = false;
