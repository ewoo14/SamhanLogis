-- #1123 S1: 마감된 전표일 신규 생성 예외 권한.
-- 기본값은 MASTER/MANAGER만 허용하며, 이후 권한 설정 메뉴에서 동적으로 조절한다.

INSERT INTO role_page_permission_templates
    (id, role_code, page_code, can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), roles.role_code, 'slip.closed-date-exception', TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE,
       NOW(), 'v95-slip-closed-date-exception', NOW(), 'v95-slip-closed-date-exception', FALSE
FROM (VALUES ('MASTER'), ('MANAGER')) AS roles(role_code)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE, can_create = TRUE, can_update = FALSE, can_delete = FALSE,
    can_restore = FALSE, can_download = FALSE, can_print = FALSE,
    modified_at = NOW(), modified_by = 'v95-slip-closed-date-exception';

INSERT INTO group_page_permissions
    (id, group_id, page_code, can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), groups.group_id, 'slip.closed-date-exception', TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE,
       NOW(), 'v95-slip-closed-date-exception', NOW(), 'v95-slip-closed-date-exception', FALSE
FROM (VALUES
    ('00000000-0000-0000-0000-000000000100'::uuid),
    ('00000000-0000-0000-0000-000000000101'::uuid)
) AS groups(group_id)
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE, can_create = TRUE, can_update = FALSE, can_delete = FALSE,
    can_restore = FALSE, can_download = FALSE, can_print = FALSE,
    modified_at = NOW(), modified_by = 'v95-slip-closed-date-exception';
