-- E2 partner list strikethrough restore.
--
-- partners.delete 는 기존 MASTER 삭제 권한 페이지다. 복원은 삭제 정책 변경이 아니라
-- soft-delete undo 이므로 동일 페이지에 can_restore 를 additive grant 한다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permission_templates
    (id, role_code, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER', 'partners.delete',
     TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE,
     NOW(), 'v82-partner-delete-restore', NOW(), 'v82-partner-delete-restore', FALSE)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_restore = TRUE,
    modified_at = NOW(),
    modified_by = 'v82-partner-delete-restore';

INSERT INTO group_page_permissions
    (id, group_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000100'::uuid, 'partners.delete',
     TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE,
     NOW(), 'v82-partner-delete-restore', NOW(), 'v82-partner-delete-restore', FALSE)
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_restore = TRUE,
    modified_at = NOW(),
    modified_by = 'v82-partner-delete-restore';

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
    'v82-partner-delete-restore',
    NOW(),
    'v82-partner-delete-restore',
    FALSE
FROM account_groups ag
JOIN accounts a
  ON a.id = ag.account_id
 AND a.is_deleted = FALSE
 AND a.enabled = TRUE
JOIN group_page_permissions gpp
  ON gpp.group_id = ag.group_id
 AND gpp.is_deleted = FALSE
 AND gpp.page_code = 'partners.delete'
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
    modified_by = 'v82-partner-delete-restore';
