-- V47__seed_products_sync_group_permission.sql
-- 권한그룹 C5 후속 정리: product-service 시트 동기화 page-code.
--
-- 신규 page: products.sync
--   - POST /api/v1/products/admin/sync      → CREATE
--   - GET  /api/v1/products/admin/sync/last → VIEW
--
-- 기존 FE RoleGuard(SHEET_SYNC_ROLES)는 MANAGER/MASTER 였다.
-- C5 이후 실권한은 group_page_permissions 가 진실원이므로 V43 빌트인 MANAGER 그룹에만
-- view/create 를 부여한다. MASTER 는 is_system_master bypass 로 통과하므로 별도 row 가 필요 없다.
-- role_page_permissions / role_page_permission_templates 는 갱신하지 않는다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO group_page_permissions
    (id, group_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000101'::uuid, 'products.sync',
     TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE,
     NOW(), 'v47-products-sync', NOW(), 'v47-products-sync', FALSE)
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update,
    can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore,
    can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print,
    modified_at = NOW(),
    modified_by = 'v47-products-sync';
