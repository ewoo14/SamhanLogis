-- R12: pending snapshot을 retry/claim/격리 가능한 상태로 확장한다.
ALTER TABLE slips
    ADD COLUMN source_warehouse_code_snapshot_status VARCHAR(20) NOT NULL DEFAULT 'NOT_REQUESTED',
    ADD COLUMN source_warehouse_code_attempt_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN source_warehouse_code_next_attempt_at TIMESTAMP,
    ADD COLUMN source_warehouse_code_claimed_at TIMESTAMP,
    ADD COLUMN source_warehouse_code_claim_token UUID,
    ADD COLUMN source_warehouse_code_last_error TEXT,
    ADD COLUMN source_warehouse_code_abandoned_at TIMESTAMP;

-- V102 이후 생성된 기존 pending row는 retry 대상로 승계한다.
UPDATE slips
   SET source_warehouse_code_snapshot_status = 'PENDING',
       source_warehouse_code_next_attempt_at = COALESCE(source_warehouse_code_next_attempt_at, CURRENT_TIMESTAMP)
 WHERE source_warehouse_code_pending = TRUE
   AND source_warehouse_code IS NULL;

-- code가 이미 저장된 direct-publish/legacy row는 완료 상태로 표시한다.
UPDATE slips
   SET source_warehouse_code_snapshot_status = 'COMPLETED'
 WHERE source_warehouse_code IS NOT NULL
   AND source_warehouse_code_snapshot_status = 'NOT_REQUESTED';

CREATE INDEX ix_slips_source_warehouse_snapshot_queue
    ON slips (source_warehouse_code_snapshot_status, source_warehouse_code_next_attempt_at, created_at)
    WHERE source_warehouse_code_snapshot_status IN ('PENDING', 'PROCESSING')
      AND is_deleted = FALSE;
