-- V32: 보상 실패 자동 재시도 메타 컬럼 (D-SER-27, ⑦ outbox/Saga)
--
-- serial_compensation_failures(V31) 는 append-only 감사 본문이며, 본 마이그레이션은
-- 자동 재시도 워커의 상태 컬럼만 추가한다. 본문(slip_no/phase/attempted_operation 등)은 불변.
--
-- retry_count    : 자동 재시도 누적 횟수 (max-retries 도달 시 후보 제외, 수동 정합 대상 유지)
-- last_retry_at  : 마지막 재시도 시각 (운영 가시성)
-- next_retry_at  : 다음 재시도 가능 시각 (지수 백오프 — NULL 이면 즉시 후보)
ALTER TABLE serial_compensation_failures
    ADD COLUMN retry_count   INT       NOT NULL DEFAULT 0,
    ADD COLUMN last_retry_at TIMESTAMP NULL,
    ADD COLUMN next_retry_at TIMESTAMP NULL;

-- 재시도 후보 조회 인덱스 — resolved=false AND next_retry_at 기준 스캔 최적화.
-- @SQLRestriction(is_deleted=false) 와 함께 미해소·미삭제 후보를 좁힌다.
CREATE INDEX idx_serial_comp_retry_candidate
    ON serial_compensation_failures (resolved, next_retry_at)
    WHERE is_deleted = FALSE;
