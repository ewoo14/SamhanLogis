-- V70__seed_hr_slip_cutoff_page_permission.sql
-- 출고 마감시간 설정 page-code: hr.slip-cutoff.
--
-- 인사(HR) 메뉴 신규 page-code. slip-service account-mode enforcement 는
-- account_page_permissions.can_<action> 을 조회한다.
-- V66 패턴과 동일하게 role/template/group/account 4-table 을 함께 동기화한다.
-- 대상 권한: MASTER / MANAGER (view + create + update + delete = TRUE).

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    roles.role_code,
    'hr.slip-cutoff',
    TRUE,
    TRUE,
    NOW(),
    'v70-hr-slip-cutoff',
    NOW(),
    'v70-hr-slip-cutoff',
    FALSE
FROM (VALUES
    ('MASTER'),
    ('MANAGER')
) AS roles(role_code)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE,
    can_edit = TRUE,
    modified_at = NOW(),
    modified_by = 'v70-hr-slip-cutoff';

INSERT INTO role_page_permission_templates
    (id, role_code, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    roles.role_code,
    'hr.slip-cutoff',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    'v70-hr-slip-cutoff',
    NOW(),
    'v70-hr-slip-cutoff',
    FALSE
FROM (VALUES
    ('MASTER'),
    ('MANAGER')
) AS roles(role_code)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE,
    can_create = TRUE,
    can_update = TRUE,
    can_delete = TRUE,
    can_restore = FALSE,
    can_download = FALSE,
    can_print = FALSE,
    modified_at = NOW(),
    modified_by = 'v70-hr-slip-cutoff';

INSERT INTO group_page_permissions
    (id, group_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    roles.group_id,
    'hr.slip-cutoff',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    'v70-hr-slip-cutoff',
    NOW(),
    'v70-hr-slip-cutoff',
    FALSE
FROM (VALUES
    ('00000000-0000-0000-0000-000000000100'::uuid),
    ('00000000-0000-0000-0000-000000000101'::uuid)
) AS roles(group_id)
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE,
    can_create = TRUE,
    can_update = TRUE,
    can_delete = TRUE,
    can_restore = FALSE,
    can_download = FALSE,
    can_print = FALSE,
    modified_at = NOW(),
    modified_by = 'v70-hr-slip-cutoff';

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
    'v70-hr-slip-cutoff',
    NOW(),
    'v70-hr-slip-cutoff',
    FALSE
FROM account_groups ag
JOIN accounts a
  ON a.id = ag.account_id
 AND a.is_deleted = FALSE
 AND a.enabled = TRUE
JOIN group_page_permissions gpp
  ON gpp.group_id = ag.group_id
 AND gpp.is_deleted = FALSE
 AND gpp.page_code = 'hr.slip-cutoff'
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
    modified_by = 'v70-hr-slip-cutoff';
