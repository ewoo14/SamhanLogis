-- V16: tax_invoices.e_tax_external_id UNIQUE INDEX (SP-09-1)
-- 홈택스 e-Tax 접수번호는 세법상 유일성 보장 필수.
-- Partial unique index: is_deleted = FALSE AND e_tax_external_id IS NOT NULL 조건만 적용
-- (soft-delete 된 row 및 미발행(NULL) row 는 중복 허용).
-- NULLable 컬럼이므로 IS NOT NULL 조건으로 NULL 다중 허용 유지.
CREATE UNIQUE INDEX IF NOT EXISTS ux_tax_invoices_etax_external_id
    ON tax_invoices (e_tax_external_id)
    WHERE is_deleted = FALSE
      AND e_tax_external_id IS NOT NULL;
