-- V35__add_estimate_line_unit_price_with_vat.sql
-- 2026-06-09 — 단가 부가세포함 전환 PR-B(견적). estimate_lines 에 VAT 포함 단가 컬럼 추가.
--   unit_price_with_vat: non-null 이면 해당 라인이 부가세 포함 단가 입력(라인 단위 eCount 분해).
--                        화면 '단가' 표시값 + 견적→전표 변환 시 VAT 포함 단가 보존용.
-- nullable/no-default — 기존 라인(legacy, VAT 미포함 공급단가)은 NULL 유지.

ALTER TABLE estimate_lines
    ADD COLUMN IF NOT EXISTS unit_price_with_vat NUMERIC(15, 2);
