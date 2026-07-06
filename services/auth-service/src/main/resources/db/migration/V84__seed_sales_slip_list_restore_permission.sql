-- E2 판매전표 목록 soft-delete 복원 권한.
--
-- sales.slip.list 는 판매전표 목록 화면의 page-code다. 목록 삭제행 복원 버튼은
-- 목록 화면 안의 undo 동작이므로 동일 page-code에 can_restore를 additive grant 한다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permission_templates
    (id, role_code, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    roles.role_code,
    'sales.slip.list',
    TRUE,
    roles.can_create,
    roles.can_update,
    roles.can_delete,
    TRUE,
    FALSE,
    FALSE,
    NOW(),
    'v84-sales-slip-list-restore',
    NOW(),
    'v84-sales-slip-list-restore',
    FALSE
FROM (VALUES
    ('MASTER', TRUE, TRUE, TRUE),
    ('MANAGER', FALSE, TRUE, TRUE),
    ('SALES', TRUE, TRUE, TRUE)
) AS roles(role_code, can_create, can_update, can_delete)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_restore = TRUE,
    modified_at = NOW(),
    modified_by = 'v84-sales-slip-list-restore';

INSERT INTO group_page_permissions
    (id, group_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    roles.group_id,
    'sales.slip.list',
    TRUE,
    roles.can_create,
    roles.can_update,
    roles.can_delete,
    TRUE,
    FALSE,
    FALSE,
    NOW(),
    'v84-sales-slip-list-restore',
    NOW(),
    'v84-sales-slip-list-restore',
    FALSE
FROM (VALUES
    ('00000000-0000-0000-0000-000000000100'::uuid, TRUE, TRUE, TRUE),
    ('00000000-0000-0000-0000-000000000101'::uuid, FALSE, TRUE, TRUE),
    ('00000000-0000-0000-0000-000000000102'::uuid, TRUE, TRUE, TRUE)
) AS roles(group_id, can_create, can_update, can_delete)
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_restore = TRUE,
    modified_at = NOW(),
    modified_by = 'v84-sales-slip-list-restore';

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
    'v84-sales-slip-list-restore',
    NOW(),
    'v84-sales-slip-list-restore',
    FALSE
FROM account_groups ag
JOIN accounts a
  ON a.id = ag.account_id
 AND a.is_deleted = FALSE
 AND a.enabled = TRUE
JOIN group_page_permissions gpp
  ON gpp.group_id = ag.group_id
 AND gpp.is_deleted = FALSE
 AND gpp.page_code = 'sales.slip.list'
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
    modified_by = 'v84-sales-slip-list-restore';
