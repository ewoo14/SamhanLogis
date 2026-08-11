-- D-G1 S4a: 영업수수료 정산 전용 pageCode 및 기본 권한.
-- ACCOUNTANT 이상(MASTER/MANAGER/ACCOUNTANT)은 7-action 기준 VIEW/CREATE/UPDATE만 허용한다.
-- SALES 이하 역할은 명시적 0 비트 row를 남겨 권한 매트릭스에서 개별 관리한다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

WITH roles(role_code) AS (
    VALUES ('MASTER'), ('MANAGER'), ('ACCOUNTANT'), ('SALES'), ('WAREHOUSE'),
           ('DISPATCH'), ('INVENTORY'), ('DEVELOPER'), ('PARTNER'), ('STAFF'), ('DRIVER')
), grants(role_code, can_view, can_edit) AS (
    VALUES ('MASTER', TRUE, TRUE), ('MANAGER', TRUE, TRUE), ('ACCOUNTANT', TRUE, TRUE)
)
INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), r.role_code, 'accounting.sales-commission-settlement',
       COALESCE(g.can_view, FALSE), COALESCE(g.can_edit, FALSE),
       NOW(), 'v101-sales-commission-settlement', NOW(),
       'v101-sales-commission-settlement', FALSE
FROM roles r
LEFT JOIN grants g ON g.role_code = r.role_code
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_edit = EXCLUDED.can_edit,
    modified_at = NOW(),
    modified_by = 'v101-sales-commission-settlement';

WITH roles(role_code) AS (
    VALUES ('MASTER'), ('MANAGER'), ('ACCOUNTANT'), ('SALES'), ('WAREHOUSE'),
           ('DISPATCH'), ('INVENTORY'), ('DEVELOPER'), ('PARTNER'), ('STAFF'), ('DRIVER')
), grants(role_code, can_view, can_create, can_update) AS (
    VALUES ('MASTER', TRUE, TRUE, TRUE),
           ('MANAGER', TRUE, TRUE, TRUE),
            ('ACCOUNTANT', TRUE, TRUE, TRUE)
)
INSERT INTO role_page_permission_templates
    (id, role_code, page_code, can_view, can_create, can_update, can_delete,
     can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), r.role_code, 'accounting.sales-commission-settlement',
       COALESCE(g.can_view, FALSE), COALESCE(g.can_create, FALSE), COALESCE(g.can_update, FALSE),
       FALSE, FALSE, FALSE, FALSE,
       NOW(), 'v101-sales-commission-settlement', NOW(),
       'v101-sales-commission-settlement', FALSE
FROM roles r
LEFT JOIN grants g ON g.role_code = r.role_code
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view,
    can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update,
    can_delete = FALSE,
    can_restore = FALSE,
    can_download = FALSE,
    can_print = FALSE,
    modified_at = NOW(),
    modified_by = 'v101-sales-commission-settlement';

INSERT INTO group_page_permissions
    (id, group_id, page_code, can_view, can_create, can_update, can_delete,
     can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), g.group_id, 'accounting.sales-commission-settlement',
       TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE,
       NOW(), 'v101-sales-commission-settlement', NOW(),
       'v101-sales-commission-settlement', FALSE
FROM (VALUES
    ('00000000-0000-0000-0000-000000000100'::uuid),
    ('00000000-0000-0000-0000-000000000101'::uuid),
    ('00000000-0000-0000-0000-000000000104'::uuid)
) AS g(group_id)
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE, can_create = TRUE, can_update = TRUE,
    can_delete = FALSE, can_restore = FALSE, can_download = FALSE, can_print = FALSE,
    modified_at = NOW(), modified_by = 'v101-sales-commission-settlement';

INSERT INTO account_page_permissions
    (id, account_id, page_code, can_view, can_create, can_update, can_delete,
     can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), ag.account_id, 'accounting.sales-commission-settlement',
       TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE,
       NOW(), 'v101-sales-commission-settlement', NOW(),
       'v101-sales-commission-settlement', FALSE
FROM account_groups ag
JOIN accounts a ON a.id = ag.account_id AND a.is_deleted = FALSE AND a.enabled = TRUE
WHERE ag.is_deleted = FALSE
  AND ag.group_id IN (
      '00000000-0000-0000-0000-000000000100'::uuid,
      '00000000-0000-0000-0000-000000000101'::uuid,
      '00000000-0000-0000-0000-000000000104'::uuid
  )
  AND NOT EXISTS (
      SELECT 1 FROM account_groups master_ag
      JOIN permission_groups master_group ON master_group.id = master_ag.group_id
          AND master_group.is_deleted = FALSE AND master_group.is_system_master = TRUE
      WHERE master_ag.account_id = ag.account_id AND master_ag.is_deleted = FALSE
  )
ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE, can_create = TRUE, can_update = TRUE,
    can_delete = FALSE, can_restore = FALSE, can_download = FALSE, can_print = FALSE,
    modified_at = NOW(), modified_by = 'v101-sales-commission-settlement';
