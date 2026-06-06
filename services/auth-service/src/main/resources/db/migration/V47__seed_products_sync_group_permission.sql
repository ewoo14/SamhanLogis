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
--
-- (DevOps D-1) is_deleted=TRUE 소프트삭제 행이 존재하는 경우: partial unique index
-- (uq_group_page_permissions_active, WHERE is_deleted=FALSE)가 활성 행만 충돌 검사하므로
-- 본 INSERT 는 신규 활성 행을 추가한다 — 운영자가 의도적으로 soft-delete 한 권한을
-- 재활성화하는 의미이며 V43 과 동일 시맨틱(의도된 동작)이다.

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

-- ---------------------------------------------------------------------------
-- (사이클1 QA DEF-1 fix) enforcement 캐시 동기화.
--
-- PermissionAspect → DynamicPermissionClient → account_page_permissions 경로가 실 인가를
-- 판정하는데, Flyway 직접 seed 는 GroupPermissionService/EffectivePermissionMaterializer 를
-- 거치지 않아 account_page_permissions 가 재계산되지 않는다 (Docker 실QA: MANAGER 403 실증).
-- → products.sync 에 한해 그룹 배속 계정의 account_page_permissions 를 직접 동기화한다.
--
-- 집계 시맨틱 = materializer 와 동일:
--   - 계정이 배속된 모든 활성 그룹의 products.sync 권한 BOOL_OR 합성.
--   - 시스템 마스터 그룹(is_system_master=TRUE) 배속 계정은 제외 — X-Is-System-Master
--     bypass 로 통과하므로 materializer 도 skip 한다 (C3a 불변식).
--   - 비활성/삭제 계정 제외 (V44 와 동일 필터).
-- ---------------------------------------------------------------------------

INSERT INTO account_page_permissions
    (id, account_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    ag.account_id,
    gpp.page_code,
    BOOL_OR(gpp.can_view),
    BOOL_OR(gpp.can_create),
    BOOL_OR(gpp.can_update),
    BOOL_OR(gpp.can_delete),
    BOOL_OR(gpp.can_restore),
    BOOL_OR(gpp.can_download),
    BOOL_OR(gpp.can_print),
    NOW(),
    'v47-products-sync',
    NOW(),
    'v47-products-sync',
    FALSE
FROM account_groups ag
JOIN accounts a
  ON a.id = ag.account_id
 AND a.is_deleted = FALSE
 AND a.enabled = TRUE
JOIN group_page_permissions gpp
  ON gpp.group_id = ag.group_id
 AND gpp.is_deleted = FALSE
 AND gpp.page_code = 'products.sync'
WHERE ag.is_deleted = FALSE
  AND NOT EXISTS (
      SELECT 1
      FROM account_groups sg
      JOIN permission_groups pg
        ON pg.id = sg.group_id
       AND pg.is_deleted = FALSE
       AND pg.is_system_master = TRUE
      WHERE sg.account_id = ag.account_id
        AND sg.is_deleted = FALSE
  )
GROUP BY ag.account_id, gpp.page_code
ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update,
    can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore,
    can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print,
    modified_at = NOW(),
    modified_by = 'v47-products-sync';
