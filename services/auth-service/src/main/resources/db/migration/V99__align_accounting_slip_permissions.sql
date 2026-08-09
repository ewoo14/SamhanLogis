-- V97: 회계전표 권한 부여 및 수신 세금계산서 PageCode 이관.
--
-- 개발책임자 결정(2026-08-09):
--   * MANAGER .list 1111 -> .accounting 1111
--   * SALES   .list 1000 -> .accounting 1000
--   * 전표별 MANAGER/SALES 계정(실 DB 13명)과 그룹 2개도 같은 경로로 계승
--   * 수신 세금계산서는 V14의 MANAGER .inbound를 .inbound.manage로 이관
--     (실 계정 dev_manager/janyeonggu/manager@samhan.test + 매니저 그룹)
--
-- .list와 기존 .inbound 행은 호환 화면/롤백 근거로 삭제하지 않는다.
-- V39 이후 실 enforcement 캐시는 account_page_permissions이며, 그룹 권한은
-- group_page_permissions에서 account_page_permissions로 동기화한다.
-- 모든 upsert는 활성 partial unique index를 대상으로 하므로 멱등이다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) 레거시 role 행: MASTER/ACCOUNTANT는 기존 .list 비트를 재확인하고,
-- MANAGER/SALES에는 결정된 .list 비트를 부여한다. 그 밖의 role은 건드리지 않는다.
INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), src.role_code,
       CASE src.page_code
           WHEN 'accounting.sales-slip.list' THEN 'accounting.sales-slip.accounting'
           WHEN 'accounting.purchase-slip.list' THEN 'accounting.purchase-slip.accounting'
       END,
       src.can_view, src.can_edit,
       NOW(), 'v97-accounting-slip-grant', NOW(), 'v97-accounting-slip-grant', FALSE
FROM role_page_permissions src
WHERE src.is_deleted = FALSE
  AND src.role_code IN ('MASTER', 'ACCOUNTANT', 'MANAGER', 'SALES')
  AND src.page_code IN ('accounting.sales-slip.list', 'accounting.purchase-slip.list')
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_edit = EXCLUDED.can_edit,
    modified_at = NOW(),
    modified_by = 'v97-accounting-slip-grant';

-- 2) 역할 템플릿: 네 역할만 .list의 7-action 비트를 계승한다.
INSERT INTO role_page_permission_templates
    (id, role_code, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), src.role_code,
       CASE src.page_code
           WHEN 'accounting.sales-slip.list' THEN 'accounting.sales-slip.accounting'
           WHEN 'accounting.purchase-slip.list' THEN 'accounting.purchase-slip.accounting'
       END,
       src.can_view, src.can_create, src.can_update, src.can_delete,
       src.can_restore, src.can_download, src.can_print,
       NOW(), 'v97-accounting-slip-grant', NOW(), 'v97-accounting-slip-grant', FALSE
FROM role_page_permission_templates src
WHERE src.is_deleted = FALSE
  AND src.role_code IN ('MASTER', 'ACCOUNTANT', 'MANAGER', 'SALES')
  AND src.page_code IN ('accounting.sales-slip.list', 'accounting.purchase-slip.list')
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update,
    can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore,
    can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print,
    modified_at = NOW(),
    modified_by = 'v97-accounting-slip-grant';

-- 3) 전표 그룹: 실 DB에서 대상은 매니저/영업원 두 그룹이다.
INSERT INTO group_page_permissions
    (id, group_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), src.group_id,
       CASE src.page_code
           WHEN 'accounting.sales-slip.list' THEN 'accounting.sales-slip.accounting'
           WHEN 'accounting.purchase-slip.list' THEN 'accounting.purchase-slip.accounting'
       END,
       src.can_view, src.can_create, src.can_update, src.can_delete,
       src.can_restore, src.can_download, src.can_print,
       NOW(), 'v97-accounting-slip-grant', NOW(), 'v97-accounting-slip-grant', FALSE
FROM group_page_permissions src
WHERE src.is_deleted = FALSE
  AND src.group_id IN (
      '00000000-0000-0000-0000-000000000101'::uuid,
      '00000000-0000-0000-0000-000000000102'::uuid
  )
  AND src.page_code IN ('accounting.sales-slip.list', 'accounting.purchase-slip.list')
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update,
    can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore,
    can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print,
    modified_at = NOW(),
    modified_by = 'v97-accounting-slip-grant';

-- 4) 전표 계정 enforcement cache: 대상 그룹(매니저/영업원)에 배속된
-- 활성 계정 중 기존 .list가 허용된 실 계정 13명만 materialize한다.
INSERT INTO account_page_permissions
    (id, account_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), src.account_id,
       CASE src.page_code
           WHEN 'accounting.sales-slip.list' THEN 'accounting.sales-slip.accounting'
           WHEN 'accounting.purchase-slip.list' THEN 'accounting.purchase-slip.accounting'
       END,
       src.can_view, src.can_create, src.can_update, src.can_delete,
       src.can_restore, src.can_download, src.can_print,
       NOW(), 'v97-accounting-slip-grant', NOW(), 'v97-accounting-slip-grant', FALSE
FROM account_page_permissions src
JOIN accounts a ON a.id = src.account_id
               AND a.is_deleted = FALSE
               AND a.enabled = TRUE
WHERE src.is_deleted = FALSE
  AND src.page_code IN ('accounting.sales-slip.list', 'accounting.purchase-slip.list')
  AND EXISTS (
      SELECT 1
      FROM account_groups ag
      WHERE ag.account_id = src.account_id
        AND ag.is_deleted = FALSE
        AND ag.group_id IN (
            '00000000-0000-0000-0000-000000000101'::uuid,
            '00000000-0000-0000-0000-000000000102'::uuid
        )
  )
ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update,
    can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore,
    can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print,
    modified_at = NOW(),
    modified_by = 'v97-accounting-slip-grant';

-- 5) 수신 세금계산서: V14의 MANAGER role/group/account 대상만 canonical
-- .inbound.manage로 이관한다. 기존 .inbound 행은 삭제하지 않는다.
INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), 'MANAGER', 'accounting.tax-invoice.inbound.manage',
       src.can_view, src.can_edit,
       NOW(), 'v97-inbound-manage-grant', NOW(), 'v97-inbound-manage-grant', FALSE
FROM role_page_permissions src
WHERE src.role_code = 'MANAGER'
  AND src.page_code = 'accounting.tax-invoice.inbound'
  AND src.is_deleted = FALSE
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit,
    modified_at = NOW(), modified_by = 'v97-inbound-manage-grant';

INSERT INTO role_page_permission_templates
    (id, role_code, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), 'MANAGER', 'accounting.tax-invoice.inbound.manage',
       src.can_view, src.can_create, src.can_update, src.can_delete,
       src.can_restore, src.can_download, src.can_print,
       NOW(), 'v97-inbound-manage-grant', NOW(), 'v97-inbound-manage-grant', FALSE
FROM role_page_permission_templates src
WHERE src.role_code = 'MANAGER'
  AND src.page_code = 'accounting.tax-invoice.inbound'
  AND src.is_deleted = FALSE
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view, can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update, can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore, can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print, modified_at = NOW(),
    modified_by = 'v97-inbound-manage-grant';

INSERT INTO group_page_permissions
    (id, group_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), src.group_id, 'accounting.tax-invoice.inbound.manage',
       src.can_view, src.can_create, src.can_update, src.can_delete,
       src.can_restore, src.can_download, src.can_print,
       NOW(), 'v97-inbound-manage-grant', NOW(), 'v97-inbound-manage-grant', FALSE
FROM group_page_permissions src
WHERE src.group_id = '00000000-0000-0000-0000-000000000101'::uuid
  AND src.page_code = 'accounting.tax-invoice.inbound'
  AND src.is_deleted = FALSE
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view, can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update, can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore, can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print, modified_at = NOW(),
    modified_by = 'v97-inbound-manage-grant';

INSERT INTO account_page_permissions
    (id, account_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), src.account_id, 'accounting.tax-invoice.inbound.manage',
       src.can_view, src.can_create, src.can_update, src.can_delete,
       src.can_restore, src.can_download, src.can_print,
       NOW(), 'v97-inbound-manage-grant', NOW(), 'v97-inbound-manage-grant', FALSE
FROM account_page_permissions src
JOIN accounts a ON a.id = src.account_id
               AND a.is_deleted = FALSE
               AND a.enabled = TRUE
WHERE src.page_code = 'accounting.tax-invoice.inbound'
  AND src.is_deleted = FALSE
  AND a.login_id IN ('dev_manager', 'janyeonggu', 'manager@samhan.test')
ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view, can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update, can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore, can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print, modified_at = NOW(),
    modified_by = 'v97-inbound-manage-grant';
