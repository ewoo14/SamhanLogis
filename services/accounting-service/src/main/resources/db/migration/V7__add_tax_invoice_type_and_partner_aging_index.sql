-- V7__add_tax_invoice_type_and_partner_aging_index.sql
-- P0-1 Slice B — 부가세신고서 / 법인세신고서 / 거래처 미수미지급 보고서 지원.
--
-- 변경 사항:
--   1. tax_invoices.invoice_type 컬럼 추가 (SALES/PURCHASE).
--      NULLable + DEFAULT 'SALES' — 기존 레코드 legacy 호환.
--   2. journal_lines 거래처별 계정 조회 인덱스 추가 (partner_aging 성능).
--
-- 적용 원칙:
--   * 신규 컬럼은 모두 NULLable 또는 DEFAULT → legacy 호환 (메모리 컨벤션).
--   * 물리 삭제 금지 (is_deleted soft-delete 패턴 유지).

----------------------------------------------------------------------
-- 1) tax_invoices.invoice_type — 매출(SALES) / 매입(PURCHASE) 구분
----------------------------------------------------------------------
ALTER TABLE tax_invoices
    ADD COLUMN IF NOT EXISTS invoice_type VARCHAR(20) NULL DEFAULT 'SALES';

-- 기존 레코드는 모두 SALES 로 간주 (물류 회사 = 매출 세금계산서 중심)
UPDATE tax_invoices SET invoice_type = 'SALES' WHERE invoice_type IS NULL;

CREATE INDEX IF NOT EXISTS ix_tax_invoices_type_status_date
    ON tax_invoices (invoice_type, status, supply_date, is_deleted);

----------------------------------------------------------------------
-- 2) journal_lines 거래처별 계정 인덱스 — partner_aging 집계 성능
----------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_journal_lines_partner_account
    ON journal_lines (partner_id, account_code, is_deleted);
