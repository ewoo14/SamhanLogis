-- V93: R19 — 표시·편집·복사 화면은 V92 회수 대상인 SEND_AUDIT와 별도 인가를 사용한다.
-- V92의 soft-delete 행은 복구하지 않는다. 자동 SMS 발송 권한도 seed하지 않는다.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit, created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), role_code, 'notification.dispatch-sms.display', TRUE, TRUE,
       NOW(), 'v93-dispatch-sms-display', NOW(), 'v93-dispatch-sms-display', FALSE
FROM (VALUES ('MASTER'), ('MANAGER'), ('DISPATCH')) roles(role_code)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE, can_edit = TRUE, modified_at = NOW(), modified_by = 'v93-dispatch-sms-display';

INSERT INTO role_page_permission_templates
    (id, role_code, page_code, can_view, can_create, can_update, can_delete,
     can_restore, can_download, can_print, created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), role_code, 'notification.dispatch-sms.display', TRUE, TRUE, TRUE, FALSE,
       FALSE, FALSE, FALSE, NOW(), 'v93-dispatch-sms-display', NOW(), 'v93-dispatch-sms-display', FALSE
FROM (VALUES ('MASTER'), ('MANAGER'), ('DISPATCH')) roles(role_code)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE, can_create = TRUE, can_update = TRUE, can_delete = FALSE,
    modified_at = NOW(), modified_by = 'v93-dispatch-sms-display';

INSERT INTO group_page_permissions
    (id, group_id, page_code, can_view, can_create, can_update, can_delete,
     can_restore, can_download, can_print, created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), group_id, 'notification.dispatch-sms.display', TRUE, TRUE, TRUE, FALSE,
       FALSE, FALSE, FALSE, NOW(), 'v93-dispatch-sms-display', NOW(), 'v93-dispatch-sms-display', FALSE
FROM (VALUES
    ('00000000-0000-0000-0000-000000000100'::uuid),
    ('00000000-0000-0000-0000-000000000101'::uuid),
    ('00000000-0000-0000-0000-000000000106'::uuid)
) groups(group_id)
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE, can_create = TRUE, can_update = TRUE, can_delete = FALSE,
    modified_at = NOW(), modified_by = 'v93-dispatch-sms-display';

INSERT INTO account_page_permissions
    (id, account_id, page_code, can_view, can_create, can_update, can_delete,
     can_restore, can_download, can_print, created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), ag.account_id, gpp.page_code,
       BOOL_OR(gpp.can_view), BOOL_OR(gpp.can_create), BOOL_OR(gpp.can_update), BOOL_OR(gpp.can_delete),
       BOOL_OR(gpp.can_restore), BOOL_OR(gpp.can_download), BOOL_OR(gpp.can_print),
       NOW(), 'v93-dispatch-sms-display', NOW(), 'v93-dispatch-sms-display', FALSE
FROM account_groups ag
JOIN accounts a ON a.id = ag.account_id AND a.is_deleted = FALSE AND a.enabled = TRUE
JOIN group_page_permissions gpp ON gpp.group_id = ag.group_id
    AND gpp.page_code = 'notification.dispatch-sms.display' AND gpp.is_deleted = FALSE
WHERE ag.is_deleted = FALSE
  AND NOT EXISTS (
      SELECT 1 FROM account_groups sg
      JOIN permission_groups pg ON pg.id = sg.group_id
          AND pg.is_deleted = FALSE AND pg.is_system_master = TRUE
      WHERE sg.account_id = ag.account_id AND sg.is_deleted = FALSE)
GROUP BY ag.account_id, gpp.page_code
ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view, can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update, can_delete = EXCLUDED.can_delete,
    modified_at = NOW(), modified_by = 'v93-dispatch-sms-display';
