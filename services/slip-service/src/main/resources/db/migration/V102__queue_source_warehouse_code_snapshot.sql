-- 신규 발행 전표만 inventory 창고 code 보강 재시도 대상으로 표시한다.
-- 기존 행은 기본 FALSE로 남겨 A안(원천 엄격 유지)의 UNKNOWN 정책을 보존한다.
ALTER TABLE slips
    ADD COLUMN source_warehouse_code_pending BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX ix_slips_source_warehouse_code_pending
    ON slips (source_warehouse_code_pending, created_at)
    WHERE source_warehouse_code_pending = TRUE AND is_deleted = FALSE;
