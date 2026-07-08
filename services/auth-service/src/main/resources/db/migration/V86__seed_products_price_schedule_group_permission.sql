-- V86__seed_products_price_schedule_group_permission.sql
-- #17 단가변동 S4a: 단가변동 스케줄 admin page-code.
--
-- 신규 page: products.price-schedule
--   - GET /api/v1/products/admin/price-change-schedule            → VIEW
--   - PUT /api/v1/products/admin/price-change-schedule/{category} → UPDATE
--
-- V47(products.sync)과 동일한 "group_page_permissions 가 진실원" 패턴을 그대로 따르되,
-- dev-lead 확정 스코프(리뷰 fix): MANAGER + ACCOUNTANT 양쪽 빌트인 그룹에 view/update 를
-- 부여한다 — V80(accounting.cash-receipts) 다중 그룹 grant 패턴 mirror. MASTER 는
-- is_system_master bypass 로 통과하므로 별도 row 가 필요 없다(V47 과 동일 근거). role_page_permissions /
-- role_page_permission_templates(레거시 role 테이블)는 갱신하지 않는다 — V47 결정과 동일.
--
-- (V47 DEF-1 fix 동일 시맨틱) PermissionAspect → DynamicPermissionClient →
-- account_page_permissions 경로가 실 인가를 판정하므로, Flyway seed 직후 그룹 배속 계정의
-- account_page_permissions 도 함께 동기화한다 (MANAGER + ACCOUNTANT 양쪽 그룹 배속 계정 모두 포함).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO group_page_permissions
    (id, group_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    groups.group_id,
    'products.price-schedule',
    TRUE,
    FALSE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    'v86-products-price-schedule',
    NOW(),
    'v86-products-price-schedule',
    FALSE
FROM (VALUES
    ('00000000-0000-0000-0000-000000000101'::uuid), -- MANAGER
    ('00000000-0000-0000-0000-000000000104'::uuid)  -- ACCOUNTANT
) AS groups(group_id)
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update,
    can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore,
    can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print,
    modified_at = NOW(),
    modified_by = 'v86-products-price-schedule';

-- ---------------------------------------------------------------------------
-- enforcement 캐시 동기화 (V47 DEF-1 fix 와 동일 집계 시맨틱, V80 다중 그룹 스코프 mirror).
--
--   - 계정이 배속된 MANAGER/ACCOUNTANT 그룹의 products.price-schedule 권한 BOOL_OR 합성.
--   - 시스템 마스터 그룹(is_system_master=TRUE) 배속 계정은 제외 — X-Is-System-Master
--     bypass 로 통과하므로 materializer 도 skip 한다 (C3a 불변식).
--   - 비활성/삭제 계정 제외 (V44/V47 과 동일 필터).
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
    'v86-products-price-schedule',
    NOW(),
    'v86-products-price-schedule',
    FALSE
FROM account_groups ag
JOIN accounts a
  ON a.id = ag.account_id
 AND a.is_deleted = FALSE
 AND a.enabled = TRUE
JOIN group_page_permissions gpp
  ON gpp.group_id = ag.group_id
 AND gpp.is_deleted = FALSE
 AND gpp.page_code = 'products.price-schedule'
WHERE ag.is_deleted = FALSE
  AND EXISTS (
      SELECT 1
        FROM account_groups target_ag
       WHERE target_ag.account_id = ag.account_id
         AND target_ag.group_id IN (
             '00000000-0000-0000-0000-000000000101'::uuid, -- MANAGER
             '00000000-0000-0000-0000-000000000104'::uuid  -- ACCOUNTANT
         )
         AND target_ag.is_deleted = FALSE
  )
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
    modified_by = 'v86-products-price-schedule';
