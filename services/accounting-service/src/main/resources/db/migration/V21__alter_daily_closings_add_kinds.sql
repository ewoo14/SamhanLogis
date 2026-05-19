-- V21: SP-SAS-5 DailyClosing closing_kind + source_kind 컬럼 추가.
-- 기존 SP-08-6-5 row 는 SALES + TAX_INVOICE 로 후방 호환한다.

ALTER TABLE daily_closings
    ADD COLUMN closing_kind VARCHAR(20),
    ADD COLUMN source_kind VARCHAR(20);

UPDATE daily_closings
SET closing_kind = 'SALES',
    source_kind = 'TAX_INVOICE'
WHERE closing_kind IS NULL
   OR source_kind IS NULL;

ALTER TABLE daily_closings
    ALTER COLUMN closing_kind SET NOT NULL,
    ALTER COLUMN source_kind SET NOT NULL;

ALTER TABLE daily_closings
    ADD CONSTRAINT chk_dc_kind
        CHECK (closing_kind IN ('SALES', 'PURCHASE')),
    ADD CONSTRAINT chk_dc_source_kind
        CHECK (source_kind IN ('TAX_INVOICE', 'SALES_SLIP', 'PURCHASE_SLIP'));

DROP INDEX IF EXISTS uq_daily_closings_date_partner_active;
DROP INDEX IF EXISTS uq_daily_closings_date_all_active;

CREATE UNIQUE INDEX uq_daily_closings_date_partner_kind_source_active
    ON daily_closings (closing_date, partner_id, closing_kind, source_kind)
    WHERE is_deleted = FALSE AND partner_id IS NOT NULL;

CREATE UNIQUE INDEX uq_daily_closings_date_all_kind_source_active
    ON daily_closings (closing_date, closing_kind, source_kind)
    WHERE is_deleted = FALSE AND partner_id IS NULL;

CREATE INDEX idx_dc_kind_source
    ON daily_closings (closing_date, closing_kind, source_kind)
    WHERE is_deleted = FALSE;
