-- 메신저 복수 수신 묶음 식별자. 기존 단건 행은 NULL로 유지한다.
ALTER TABLE messages ADD COLUMN batch_id UUID;

CREATE INDEX ix_messages_batch_active
    ON messages (batch_id)
    WHERE is_deleted = FALSE;
