-- V11__add_tax_invoice_issuance_fields.sql
-- P0-4 세금계산서 발행 + 인쇄 — 신규 컬럼 + 인덱스 추가.
--
-- 변경 사항:
--   1. tax_invoices.cancel_reason      — 취소 사유 (CANCELLED 시 의무, 5자 이상)
--   2. tax_invoices.partner_code       — 거래처 코드 (비즈니스 식별자, UUID 비공개)
--   3. tax_invoice_lines.unit          — 단위 (건/kg/CBM 등)
--
-- 인덱스:
--   4. ix_tax_invoices_status_supply_date — 발행 history 조회 성능
--   5. ix_tax_invoices_type_date_status   — type + fromDate/toDate 필터 성능
--   6. ix_tax_invoices_partner_supply_date — 거래처별 발행 조회 성능
--
-- 적용 원칙:
--   * 신규 컬럼 NULLable — legacy 레코드 호환 (메모리 컨벤션).
--   * 물리 삭제 금지 (is_deleted soft-delete 유지).
--   * IF NOT EXISTS 가드 — 멱등 재적용 안전.

----------------------------------------------------------------------
-- 1) tax_invoices.cancel_reason — 취소 사유 텍스트
----------------------------------------------------------------------
ALTER TABLE tax_invoices
    ADD COLUMN IF NOT EXISTS cancel_reason VARCHAR(1000) NULL;

----------------------------------------------------------------------
-- 2) tax_invoices.partner_code — 거래처 코드 (비즈니스 식별자, UUID 비공개)
----------------------------------------------------------------------
ALTER TABLE tax_invoices
    ADD COLUMN IF NOT EXISTS partner_code VARCHAR(50) NULL;

----------------------------------------------------------------------
-- 3) tax_invoice_lines.unit — 단위 (건/kg/CBM 등)
----------------------------------------------------------------------
ALTER TABLE tax_invoice_lines
    ADD COLUMN IF NOT EXISTS unit VARCHAR(20) NULL;

----------------------------------------------------------------------
-- 3) 발행 history 조회 인덱스 — status + supply_date (fromDate/toDate)
----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_tax_invoices_status_supply_date
    ON tax_invoices (status, supply_date, is_deleted);

----------------------------------------------------------------------
-- 4) 종류 + 날짜 복합 인덱스 — type + status + supply_date 필터
----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_tax_invoices_type_date_status
    ON tax_invoices (invoice_type, supply_date, status, is_deleted);

----------------------------------------------------------------------
-- 5) partner_id + supply_date 인덱스 — 거래처별 발행 조회 성능
----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_tax_invoices_partner_supply_date
    ON tax_invoices (partner_id, supply_date, is_deleted);
