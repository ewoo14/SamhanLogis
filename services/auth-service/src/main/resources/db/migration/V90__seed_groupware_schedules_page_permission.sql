-- V90__seed_groupware_schedules_page_permission.sql
-- PR #994 / Issue #895: 일정 권한을 메신저 권한에서 분리한다.
--
-- 내부 사용자(Role 10종)는 메신저 발송 권한과 무관하게 일정 등록/조회가 가능해야 한다.
-- 일정 수정/삭제는 groupware-service의 owner UUID 객체 권한 검사가 최종 방어선이다.
-- PARTNER는 내부 사용자 범위가 아니므로 seed하지 않는다.
--
-- V39 이후 실효 인가 경로인 group_page_permissions/account_page_permissions와
-- 권한 화면/호환 조회용 role 계열을 함께 동기화한다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 레거시 role 매트릭스/템플릿에도 등재해 권한 카탈로그와 기존 조회 경로를 보존한다.
INSERT INTO role_page_permissions
    (id, role_code, page_code, can_view, can_edit,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    roles.role_code,
    'groupware.schedules',
    TRUE,
    TRUE,
    NOW(),
    'v90-groupware-schedules',
    NOW(),
    'v90-groupware-schedules',
    FALSE
FROM (VALUES
    ('MASTER'), ('DEVELOPER'), ('MANAGER'), ('DISPATCH'), ('SALES'),
    ('ACCOUNTANT'), ('WAREHOUSE'), ('INVENTORY'), ('STAFF'), ('DRIVER')
) AS roles(role_code)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE,
    can_edit = TRUE,
    modified_at = NOW(),
    modified_by = 'v90-groupware-schedules';

INSERT INTO role_page_permission_templates
    (id, role_code, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    roles.role_code,
    'groupware.schedules',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    'v90-groupware-schedules',
    NOW(),
    'v90-groupware-schedules',
    FALSE
FROM (VALUES
    ('MASTER'), ('DEVELOPER'), ('MANAGER'), ('DISPATCH'), ('SALES'),
    ('ACCOUNTANT'), ('WAREHOUSE'), ('INVENTORY'), ('STAFF'), ('DRIVER')
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
    modified_by = 'v90-groupware-schedules';

-- V43 빌트인 내부 역할 그룹에 일정 권한을 부여한다.
INSERT INTO group_page_permissions
    (id, group_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    groups.group_id,
    'groupware.schedules',
    TRUE,
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    FALSE,
    FALSE,
    NOW(),
    'v90-groupware-schedules',
    NOW(),
    'v90-groupware-schedules',
    FALSE
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
) AS groups(group_id)
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
SET can_view = TRUE,
    can_create = TRUE,
    can_update = TRUE,
    can_delete = TRUE,
    can_restore = FALSE,
    can_download = FALSE,
    can_print = FALSE,
    modified_at = NOW(),
    modified_by = 'v90-groupware-schedules';

-- 기존 활성 계정의 실효 권한 캐시를 새 그룹 grant와 동기화한다.
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
    'v90-groupware-schedules',
    NOW(),
    'v90-groupware-schedules',
    FALSE
FROM account_groups ag
JOIN accounts a
  ON a.id = ag.account_id
 AND a.is_deleted = FALSE
 AND a.enabled = TRUE
JOIN group_page_permissions gpp
  ON gpp.group_id = ag.group_id
 AND gpp.is_deleted = FALSE
 AND gpp.page_code = 'groupware.schedules'
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
    modified_by = 'v90-groupware-schedules';
