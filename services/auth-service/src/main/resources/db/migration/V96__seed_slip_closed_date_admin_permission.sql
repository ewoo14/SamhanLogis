-- #1123 S9: 전표 마감 기준선 관리자 API 권한 및 V95 예외 권한 enforcement materialization.

INSERT INTO group_page_permissions
    (id, group_id, page_code, can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), groups.group_id, 'slip.closed-date-admin', TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE,
       NOW(), 'v96-slip-closed-date-admin', NOW(), 'v96-slip-closed-date-admin', FALSE
FROM (VALUES
    ('00000000-0000-0000-0000-000000000100'::uuid),
    ('00000000-0000-0000-0000-000000000101'::uuid)
) AS groups(group_id)
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE, can_create = TRUE, can_update = TRUE, can_delete = TRUE,
    can_restore = FALSE, can_download = FALSE, can_print = FALSE,
    modified_at = NOW(), modified_by = 'v96-slip-closed-date-admin';

INSERT INTO account_page_permissions
    (id, account_id, page_code, can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), ag.account_id, gpp.page_code,
       BOOL_OR(gpp.can_view), BOOL_OR(gpp.can_create), BOOL_OR(gpp.can_update), BOOL_OR(gpp.can_delete),
       BOOL_OR(gpp.can_restore), BOOL_OR(gpp.can_download), BOOL_OR(gpp.can_print),
       NOW(), 'v96-slip-closed-date-admin', NOW(), 'v96-slip-closed-date-admin', FALSE
FROM account_groups ag
JOIN accounts a ON a.id = ag.account_id AND a.is_deleted = FALSE AND a.enabled = TRUE
JOIN group_page_permissions gpp ON gpp.group_id = ag.group_id
 AND gpp.is_deleted = FALSE
 AND gpp.page_code IN ('slip.closed-date-exception', 'slip.closed-date-admin')
WHERE ag.is_deleted = FALSE
  AND NOT EXISTS (
      SELECT 1 FROM account_groups sg
      JOIN permission_groups pg ON pg.id = sg.group_id
       AND pg.is_deleted = FALSE AND pg.is_system_master = TRUE
      WHERE sg.account_id = ag.account_id AND sg.is_deleted = FALSE
  )
GROUP BY ag.account_id, gpp.page_code
ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view, can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update, can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore, can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print, modified_at = NOW(), modified_by = 'v96-slip-closed-date-admin';
