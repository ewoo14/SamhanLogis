-- V33: 보상 실패 감사 물리 purge 인덱스 (D-SER-28)
--
-- retention soft-delete 후 grace 기간이 지난 행을 deleted_at 기준으로 단일 배치 물리 삭제한다.
-- 활성 행(is_deleted=false)은 purge 후보가 아니므로 partial index 로 soft-delete 행만 좁힌다.
-- CREATE INDEX 일반 방식: 보상 실패 감사 테이블 행수 미미 전제로 운영 잠금 영향은 무시 가능하다.
-- 대용량화 시점에는 별도 마이그레이션에서 CONCURRENTLY 재고한다.
CREATE INDEX idx_serial_comp_failures_deleted
    ON serial_compensation_failures (deleted_at)
    WHERE is_deleted = TRUE;
