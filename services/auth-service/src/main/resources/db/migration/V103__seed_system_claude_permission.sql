-- #901 S1 — Claude 사용 자체를 기존 page × 7-action 권한 체계에 등록한다.
-- 축 0은 VIEW 한 비트만 사용한다. MASTER만 기본 허용하고, 나머지는 전부 명시적 OFF다.
-- 업무 도구 권한(축 1)이나 확인 절차(축 2)는 이 migration에 포함하지 않는다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

WITH roles(role_code) AS (
    VALUES ('MASTER'), ('MANAGER'), ('ACCOUNTANT'), ('SALES'), ('WAREHOUSE'),
           ('DISPATCH'), ('INVENTORY'), ('DEVELOPER'), ('PARTNER'), ('STAFF'), ('DRIVER')
), grants(role_code, can_view) AS (
    VALUES ('MASTER', TRUE)
)
INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), r.role_code, 'system.claude',
       COALESCE(g.can_view, FALSE), FALSE,
       NOW(), 'v103-system-claude', NOW(), 'v103-system-claude', FALSE
FROM roles r
LEFT JOIN grants g ON g.role_code = r.role_code
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view, can_edit = FALSE,
    modified_at = NOW(), modified_by = 'v103-system-claude';

WITH roles(role_code) AS (
    VALUES ('MASTER'), ('MANAGER'), ('ACCOUNTANT'), ('SALES'), ('WAREHOUSE'),
           ('DISPATCH'), ('INVENTORY'), ('DEVELOPER'), ('PARTNER'), ('STAFF'), ('DRIVER')
), grants(role_code, can_view) AS (
    VALUES ('MASTER', TRUE)
)
INSERT INTO role_page_permission_templates
    (id, role_code, page_code, can_view, can_create, can_update, can_delete,
     can_restore, can_download, can_print, created_at, created_by,
     modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), r.role_code, 'system.claude',
       COALESCE(g.can_view, FALSE), FALSE, FALSE, FALSE, FALSE, FALSE, FALSE,
       NOW(), 'v103-system-claude', NOW(), 'v103-system-claude', FALSE
FROM roles r
LEFT JOIN grants g ON g.role_code = r.role_code
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view, can_create = FALSE, can_update = FALSE,
    can_delete = FALSE, can_restore = FALSE, can_download = FALSE, can_print = FALSE,
    modified_at = NOW(), modified_by = 'v103-system-claude';

-- 기존 빌트인 역할그룹 10개에 정확한 7비트 row를 모두 남긴다.
INSERT INTO group_page_permissions
    (id, group_id, page_code, can_view, can_create, can_update, can_delete,
     can_restore, can_download, can_print, created_at, created_by,
     modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), g.group_id, 'system.claude',
       CASE WHEN g.group_id = '00000000-0000-0000-0000-000000000100'::uuid THEN TRUE ELSE FALSE END,
       FALSE, FALSE, FALSE, FALSE, FALSE, FALSE,
       NOW(), 'v103-system-claude', NOW(), 'v103-system-claude', FALSE
FROM (VALUES
    ('00000000-0000-0000-0000-000000000100'::uuid),
    ('00000000-0000-0000-0000-000000000101'::uuid),
    ('00000000-0000-0000-0000-000000000102'::uuid),
    ('00000000-0000-0000-0000-000000000103'::uuid),
    ('00000000-0000-0000-0000-000000000104'::uuid),
    ('00000000-0000-0000-0000-000000000105'::uuid),
    ('00000000-0000-0000-0000-000000000106'::uuid),
    ('00000000-0000-0000-0000-000000000107'::uuid),
    ('00000000-0000-0000-0000-000000000108'::uuid),
    ('00000000-0000-0000-0000-000000000109'::uuid)
) AS g(group_id)
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view, can_create = FALSE, can_update = FALSE,
    can_delete = FALSE, can_restore = FALSE, can_download = FALSE, can_print = FALSE,
    modified_at = NOW(), modified_by = 'v103-system-claude';

-- 비-MASTER 기존 계정의 실효 캐시를 그룹 row와 동기화한다.
INSERT INTO account_page_permissions
    (id, account_id, page_code, can_view, can_create, can_update, can_delete,
     can_restore, can_download, can_print, created_at, created_by,
     modified_at, modified_by, is_deleted)
SELECT gen_random_uuid(), ag.account_id, gpp.page_code,
       BOOL_OR(gpp.can_view), BOOL_OR(gpp.can_create), BOOL_OR(gpp.can_update),
       BOOL_OR(gpp.can_delete), BOOL_OR(gpp.can_restore), BOOL_OR(gpp.can_download),
       BOOL_OR(gpp.can_print), NOW(), 'v103-system-claude', NOW(), 'v103-system-claude', FALSE
FROM account_groups ag
JOIN accounts a ON a.id = ag.account_id AND a.is_deleted = FALSE AND a.enabled = TRUE
JOIN group_page_permissions gpp ON gpp.group_id = ag.group_id
    AND gpp.page_code = 'system.claude' AND gpp.is_deleted = FALSE
WHERE ag.is_deleted = FALSE
  AND NOT EXISTS (
      SELECT 1
      FROM account_groups master_ag
      JOIN permission_groups master_group ON master_group.id = master_ag.group_id
          AND master_group.is_deleted = FALSE AND master_group.is_system_master = TRUE
      WHERE master_ag.account_id = ag.account_id AND master_ag.is_deleted = FALSE
  )
GROUP BY ag.account_id, gpp.page_code
ON CONFLICT (account_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = EXCLUDED.can_view, can_create = EXCLUDED.can_create,
    can_update = EXCLUDED.can_update, can_delete = EXCLUDED.can_delete,
    can_restore = EXCLUDED.can_restore, can_download = EXCLUDED.can_download,
    can_print = EXCLUDED.can_print, modified_at = NOW(), modified_by = 'v103-system-claude';
