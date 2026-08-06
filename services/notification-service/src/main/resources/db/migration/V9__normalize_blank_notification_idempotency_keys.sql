UPDATE notification_requests
   SET idempotency_key = NULL
 WHERE idempotency_key IS NOT NULL
   AND btrim(idempotency_key) = '';

ALTER TABLE notification_requests
    ADD CONSTRAINT ck_notification_requests_idempotency_key_not_blank
    CHECK (idempotency_key IS NULL OR btrim(idempotency_key) <> '');
