-- V103: Q4 기존 legacy 세금계산서 19건 읽기전용 정책 marker
--
-- 원천전표 키를 생성하거나 tax_invoices의 연결을 보정하지 않는다.
-- marker가 없는 신규 세금계산서는 기존 생성/수정/발행 흐름을 유지한다.
-- backfill 대상은 2026-08-14 사전 실측의 마지막 legacy created_at까지로 고정한다.
--
-- 되돌림(감사 확인 후 수동 실행):
-- UPDATE tax_invoices
-- SET legacy_read_only = FALSE,
--     legacy_read_only_marked_at = NULL,
--     legacy_read_only_marked_by = NULL,
--     legacy_read_only_reason = NULL
-- WHERE legacy_read_only_marked_by = 'migration:V103'
--   AND legacy_read_only_reason = 'Q4 existing legacy tax invoice';

ALTER TABLE tax_invoices
    ADD COLUMN IF NOT EXISTS legacy_read_only BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS legacy_read_only_marked_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS legacy_read_only_marked_by VARCHAR(100),
    ADD COLUMN IF NOT EXISTS legacy_read_only_reason VARCHAR(200);

COMMENT ON COLUMN tax_invoices.legacy_read_only IS
    'Q4 정책 marker. 원천전표 연결 키가 아니며 TRUE인 기존 자료는 읽기전용.';
COMMENT ON COLUMN tax_invoices.legacy_read_only_marked_at IS
    'legacy read-only marker 적용 시각.';
COMMENT ON COLUMN tax_invoices.legacy_read_only_marked_by IS
    'legacy read-only marker 적용 주체 또는 migration 식별자.';
COMMENT ON COLUMN tax_invoices.legacy_read_only_reason IS
    'legacy read-only marker 적용 사유.';

CREATE INDEX IF NOT EXISTS ix_tax_invoices_legacy_read_only_active
    ON tax_invoices (legacy_read_only, is_deleted, created_at);

UPDATE tax_invoices
SET legacy_read_only = TRUE,
    legacy_read_only_marked_at = NOW(),
    legacy_read_only_marked_by = 'migration:V103',
    legacy_read_only_reason = 'Q4 existing legacy tax invoice'
WHERE is_deleted = FALSE
  AND legacy_read_only = FALSE
  AND created_at <= TIMESTAMP '2026-07-27 03:36:55.268598';
