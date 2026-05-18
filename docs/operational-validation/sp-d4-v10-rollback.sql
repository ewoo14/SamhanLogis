-- SP-D4 V10 롤백 (운영 사고 시 사용)
-- ============================================================
-- 목적: V10 migration 으로 삽입된 154 row 를 soft delete 처리
-- 정책: Soft Delete only (hard DELETE 금지 — BaseEntity 감사 보존)
-- 실행 전: 반드시 현재 운영 상태 백업 후 진행
-- 실행 환경: auth DB (auth_db) 직접 접속
-- ============================================================
--
-- 22 PageCode 목록 (SP-D4 §2 표 기준):
--   estimates.list
--   sales.partner-order.list
--   sales.partner-order.draft
--   sales.partner-order.confirm
--   sales.partner-order.history
--   sales.partner-order.print
--   sales.vendor-order
--   inventory.warehouse
--   inventory.stock
--   inventory.stock-transfer
--   inventory.dps
--   inventory.audit
--   admin.employees
--   admin.users
--   partners.list
--   partners.detail
--   partners.block
--   partners.edit-request
--   products.list
--   products.admin
--   arologis.admin
--   arologis.region
--
-- 롤백 전 row count 확인:
--   SELECT COUNT(*) FROM role_page_permissions
--   WHERE page_code IN (
--     'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
--     'sales.partner-order.confirm', 'sales.partner-order.history',
--     'sales.partner-order.print', 'sales.vendor-order',
--     'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
--     'inventory.dps', 'inventory.audit',
--     'admin.employees', 'admin.users',
--     'partners.list', 'partners.detail', 'partners.block', 'partners.edit-request',
--     'products.list', 'products.admin',
--     'arologis.admin', 'arologis.region'
--   ) AND is_deleted = FALSE;
-- 기대: 154

BEGIN;

UPDATE role_page_permissions
SET    is_deleted  = TRUE,
       deleted_at  = NOW(),
       deleted_by  = 'sp-d4-v10-rollback',
       modified_at = NOW(),
       modified_by = 'sp-d4-v10-rollback'
WHERE  page_code IN (
    -- 견적
    'estimates.list',
    -- 거래처주문
    'sales.partner-order.list',
    'sales.partner-order.draft',
    'sales.partner-order.confirm',
    'sales.partner-order.history',
    'sales.partner-order.print',
    'sales.vendor-order',
    -- 재고
    'inventory.warehouse',
    'inventory.stock',
    'inventory.stock-transfer',
    'inventory.dps',
    'inventory.audit',
    -- 직원/계정
    'admin.employees',
    'admin.users',
    -- 거래처
    'partners.list',
    'partners.detail',
    'partners.block',
    'partners.edit-request',
    -- 상품
    'products.list',
    'products.admin',
    -- 아로로지스
    'arologis.admin',
    'arologis.region'
)
  AND is_deleted = FALSE;

-- 롤백 후 영향 row 수 확인 (154 기대)
-- SELECT COUNT(*) FROM role_page_permissions
-- WHERE modified_by = 'sp-d4-v10-rollback';

COMMIT;

-- ============================================================
-- 롤백 완료 후 검증 쿼리
-- ============================================================

-- 1) 위 22 PageCode 에 활성(is_deleted=FALSE) row 없음 확인
-- SELECT page_code, is_deleted
-- FROM role_page_permissions
-- WHERE page_code IN (
--     'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
--     'sales.partner-order.confirm', 'sales.partner-order.history',
--     'sales.partner-order.print', 'sales.vendor-order',
--     'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
--     'inventory.dps', 'inventory.audit',
--     'admin.employees', 'admin.users',
--     'partners.list', 'partners.detail', 'partners.block', 'partners.edit-request',
--     'products.list', 'products.admin',
--     'arologis.admin', 'arologis.region'
-- ) AND is_deleted = FALSE;
-- 기대: 0 rows

-- 2) soft-deleted row 감사 추적 확인 (154 기대)
-- SELECT COUNT(*) FROM role_page_permissions
-- WHERE modified_by = 'sp-d4-v10-rollback' AND is_deleted = TRUE;
-- 기대: 154

-- 3) V7/V8 기존 권한(SP-D1/D2/D3) 무결성 확인
-- SELECT COUNT(*) FROM role_page_permissions
-- WHERE is_deleted = FALSE
--   AND created_by IN ('system', 'sp-d3-v9-fix');
-- V7 84 + V8 49 = 133 (V9 UPDATE 는 created_by 변경 없음) → 133 이상 기대
