-- V95: 회계전표 FE/BE PageCode 정합.
--
-- 회계전표 BE의 정본은 accounting.*.accounting 이다(V37).
-- V11/V12의 accounting.*.list 권한은 기존 화면에서 실제 사용되었으므로,
-- 권한 부여 정책을 바꾸지 않고 동일한 액션 집합을 정본 코드로 복제한다.
-- 기존 .list 행은 다른 호출자/호환 화면을 위해 삭제하지 않는다.
--
-- 대상 주체에 이미 .accounting 행이 있으면 기존 권한을 보존한다.
-- 따라서 이 migration은 기존 .accounting-only 권한을 좁히지 않고,
-- .list 권한만 누락 없이 추가하며, UNIQUE partial index + upsert로 멱등적이다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 레거시 역할 시드도 함께 정렬한다. V39 이후 enforcement는 template을
-- 소비하지만, 권한 관리/롤백용 원본도 구형 코드로 남기지 않는다.
INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    src.role_code,
    CASE src.page_code
        WHEN 'accounting.sales-slip.list' THEN 'accounting.sales-slip.accounting'
        WHEN 'accounting.purchase-slip.list' THEN 'accounting.purchase-slip.accounting'
    END,
    src.can_view, src.can_edit,
    NOW(), 'v95-accounting-slip-alignment', NOW(), 'v95-accounting-slip-alignment', FALSE
FROM role_page_permissions src
WHERE src.is_deleted = FALSE
  AND src.page_code IN ('accounting.sales-slip.list', 'accounting.purchase-slip.list')
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_edit = EXCLUDED.can_edit,
    modified_at = NOW(),
    modified_by = 'v95-accounting-slip-alignment';

-- 역할 템플릿: .list의 권한을 .accounting에 복제한다.
INSERT INTO role_page_permission_templates
    (id, role_code, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    src.role_code,
    CASE src.page_code
        WHEN 'accounting.sales-slip.list' THEN 'accounting.sales-slip.accounting'
        WHEN 'accounting.purchase-slip.list' THEN 'accounting.purchase-slip.accounting'
    END,
    src.can_view, src.can_create, src.can_update, src.can_delete,
    src.can_restore, src.can_download, src.can_print,
    NOW(), 'v95-accounting-slip-alignment', NOW(), 'v95-accounting-slip-alignment', FALSE
FROM role_page_permission_templates src
WHERE src.is_deleted = FALSE
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
    modified_by = 'v95-accounting-slip-alignment';

-- 권한 그룹: .list의 권한을 같은 그룹의 .accounting에 복제한다.
INSERT INTO group_page_permissions
    (id, group_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    src.group_id,
    CASE src.page_code
        WHEN 'accounting.sales-slip.list' THEN 'accounting.sales-slip.accounting'
        WHEN 'accounting.purchase-slip.list' THEN 'accounting.purchase-slip.accounting'
    END,
    src.can_view, src.can_create, src.can_update, src.can_delete,
    src.can_restore, src.can_download, src.can_print,
    NOW(), 'v95-accounting-slip-alignment', NOW(), 'v95-accounting-slip-alignment', FALSE
FROM group_page_permissions src
WHERE src.is_deleted = FALSE
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
    modified_by = 'v95-accounting-slip-alignment';

-- 계정 enforcement cache: .list와 동일 계정의 .accounting 행을 동기화한다.
INSERT INTO account_page_permissions
    (id, account_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    src.account_id,
    CASE src.page_code
        WHEN 'accounting.sales-slip.list' THEN 'accounting.sales-slip.accounting'
        WHEN 'accounting.purchase-slip.list' THEN 'accounting.purchase-slip.accounting'
    END,
    src.can_view, src.can_create, src.can_update, src.can_delete,
    src.can_restore, src.can_download, src.can_print,
    NOW(), 'v95-accounting-slip-alignment', NOW(), 'v95-accounting-slip-alignment', FALSE
FROM account_page_permissions src
WHERE src.is_deleted = FALSE
  AND src.page_code IN ('accounting.sales-slip.list', 'accounting.purchase-slip.list')
ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update,
    can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore,
    can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print,
    modified_at = NOW(),
    modified_by = 'v95-accounting-slip-alignment';
