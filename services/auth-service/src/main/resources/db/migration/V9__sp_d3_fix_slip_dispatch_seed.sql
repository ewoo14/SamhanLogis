-- V9__sp_d3_fix_slip_dispatch_seed.sql
-- SP-D3 동적 RBAC seed 정합 fix.
--
-- 배경:
--   V7 seed 는 SP-D1 기준으로 삽입되었으나 SP-D3 역할별 hidden 정책과 다음 3항목이 불일치함:
--
--   1) SALES dispatch.board canView=TRUE (V7:118)
--      → SP-D3 사용자 요구 ② "SALES 에게 배차 메뉴 숨김" 위반.
--      → canView=FALSE, canEdit=FALSE 로 보정.
--
--   2) WAREHOUSE purchases.receipt-ocr canView=FALSE (V7:128)
--      → SP-D3 사용자 요구 ② "WAREHOUSE 는 매입 영수증 OCR 입력 가능" 위반.
--      → canView=TRUE, canEdit=TRUE 로 보정 (SP-03 §4.2 창고 역할 포함).
--
--   3) WAREHOUSE sales.slip.list canView=TRUE (V7:130)
--      → SP-D3 사용자 요구 ② "WAREHOUSE 에게 매출 슬립 숨김" 위반.
--      → canView=FALSE, canEdit=FALSE 로 보정.
--
-- 운영 DB 에 V7 이 이미 반영되어 있으므로 신규 migration 으로 UPDATE 적용.
-- Flyway idempotency: IF NOT EXISTS 불가 (UPDATE 이므로) — 재실행 시 동일 값 덮어쓰기 (무해).

-- 1) SALES dispatch.board → canView=FALSE, canEdit=FALSE
UPDATE role_page_permissions
SET    can_view    = FALSE,
       can_edit    = FALSE,
       modified_at = NOW(),
       modified_by = 'sp-d3-v9-fix'
WHERE  role_code   = 'SALES'
  AND  page_code   = 'dispatch.board'
  AND  is_deleted  = FALSE;

-- 2) WAREHOUSE purchases.receipt-ocr → canView=TRUE, canEdit=TRUE
UPDATE role_page_permissions
SET    can_view    = TRUE,
       can_edit    = TRUE,
       modified_at = NOW(),
       modified_by = 'sp-d3-v9-fix'
WHERE  role_code   = 'WAREHOUSE'
  AND  page_code   = 'purchases.receipt-ocr'
  AND  is_deleted  = FALSE;

-- 3) WAREHOUSE sales.slip.list → canView=FALSE, canEdit=FALSE
UPDATE role_page_permissions
SET    can_view    = FALSE,
       can_edit    = FALSE,
       modified_at = NOW(),
       modified_by = 'sp-d3-v9-fix'
WHERE  role_code   = 'WAREHOUSE'
  AND  page_code   = 'sales.slip.list'
  AND  is_deleted  = FALSE;
