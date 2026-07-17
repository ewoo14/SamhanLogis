-- V61__widen_tax_invoice_partner_code_100.sql
-- #825 슬2 재수렴 #1 — tax_invoices.partner_code 길이 계약 불일치 해소.
--
-- 배경:
--   * partner-service V11 에서 partners.partner_code 를 VARCHAR(100) 으로 확장
--     (이카운트 운영 데이터 실측 max=86자 — VARCHAR(50) 초과).
--   * accounting V18/V19 의 sales_accounting_slips / purchase_accounting_slips
--     partner_code 도 VARCHAR(100).
--   * tax_invoices.partner_code 만 accounting V11 의 VARCHAR(50) 잔존 —
--     51~86자 코드 거래처 선택 시 FE 실 코드 전송 → BE 400/DB 저장 실패.
--
-- 변경 사항:
--   1. tax_invoices.partner_code VARCHAR(50) → VARCHAR(100)
--      (partner source 100 · 타 전표 100 과 통일)
--
-- 적용 원칙:
--   * VARCHAR 확장은 PostgreSQL 메타데이터 변경만 발생 (테이블 rewrite 없음) —
--     legacy 레코드 무손실, NULLable 유지.
--   * 적용된 마이그레이션 불변 원칙 — V11 수정 금지, 신규 V61 로만 확장.
--   * 물리 삭제 금지 (is_deleted soft-delete 유지).

----------------------------------------------------------------------
-- 1) tax_invoices.partner_code — VARCHAR(50) → VARCHAR(100)
----------------------------------------------------------------------
ALTER TABLE tax_invoices
    ALTER COLUMN partner_code TYPE VARCHAR(100);

COMMENT ON COLUMN tax_invoices.partner_code IS
    '거래처 코드 (비즈니스 식별자, UUID 비공개) — 이카운트 실측 max=86, partners.partner_code VARCHAR(100) 정렬 (V61 확장)';
