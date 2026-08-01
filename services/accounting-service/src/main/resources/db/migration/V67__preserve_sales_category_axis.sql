-- #991 슬2: 판매 원천의 모델/카테고리 축을 회계 문서 snapshot에 보존한다.
-- 기존 회계 행은 backfill하지 않는다. null은 A-2 UNKNOWN 표시 대상이다.
ALTER TABLE sales_accounting_slip_lines
    ADD COLUMN IF NOT EXISTS model_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS category_key VARCHAR(40);

ALTER TABLE sales_accounting_slip_allocations
    ADD COLUMN IF NOT EXISTS model_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS category_key VARCHAR(40);

ALTER TABLE tax_invoice_lines
    ADD COLUMN IF NOT EXISTS model_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS category_key VARCHAR(40);
