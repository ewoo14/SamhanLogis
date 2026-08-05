ALTER TABLE notification_requests
    ADD COLUMN dispatch_lease_until TIMESTAMP NULL;

CREATE INDEX ix_notification_requests_dispatch_lease
    ON notification_requests (status, dispatch_lease_until, created_at);
