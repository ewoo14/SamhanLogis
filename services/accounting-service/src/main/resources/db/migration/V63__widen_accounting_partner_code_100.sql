-- V63__widen_accounting_partner_code_100.sql
-- B2 D-B2-01 — accounting 유효 스키마의 partner_code VARCHAR(50) → VARCHAR(100).
-- 적용된 V13/V31/V34/V59 마이그레이션은 수정하지 않고 신규 버전으로만 확장한다.
-- 물리 인덱스는 키 표현만 넓히는 ALTER TYPE이므로 재생성하지 않는다.

ALTER TABLE tax_invoice_batch_exclusions
    ALTER COLUMN partner_code TYPE VARCHAR(100);

ALTER TABLE bank_depositor_partner_mapping
    ALTER COLUMN partner_code TYPE VARCHAR(100);

ALTER TABLE staging.ecount_sales_ledger_raw
    ALTER COLUMN partner_code TYPE VARCHAR(100);

ALTER TABLE staging.ecount_purchase_ledger_raw
    ALTER COLUMN partner_code TYPE VARCHAR(100);
