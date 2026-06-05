-- V43__seed_role_groups.sql
-- 고정 역할 10개 중 MASTER 는 시스템 빌트인 그룹으로, 나머지 9역할은 수정/삭제 가능한 기본 그룹으로 이관한다.
--
-- UUID 전략:
--   - permission_groups.id 는 SQL 안에 역할별 고정 리터럴을 둔다.
--   - V44 및 IT 가 동일 UUID 를 직접 참조할 수 있도록 000...0100 대역을 권한그룹 seed 전용으로 예약한다.
--   - group_page_permissions.id 는 V39 와 동일하게 gen_random_uuid() 를 사용한다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO permission_groups
    (id, name, description, is_builtin, is_system_master,
     created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
    ('00000000-0000-0000-0000-000000000100', '마스터', 'MASTER 시스템 전권 그룹', TRUE, TRUE,
     NOW(), 'v43-seed-role-groups', NOW(), 'v43-seed-role-groups', FALSE),
    ('00000000-0000-0000-0000-000000000101', '매니저', 'MANAGER 기본 권한그룹', FALSE, FALSE,
     NOW(), 'v43-seed-role-groups', NOW(), 'v43-seed-role-groups', FALSE),
    ('00000000-0000-0000-0000-000000000102', '영업원', 'SALES 기본 권한그룹', FALSE, FALSE,
     NOW(), 'v43-seed-role-groups', NOW(), 'v43-seed-role-groups', FALSE),
    ('00000000-0000-0000-0000-000000000103', '창고원', 'WAREHOUSE 기본 권한그룹', FALSE, FALSE,
     NOW(), 'v43-seed-role-groups', NOW(), 'v43-seed-role-groups', FALSE),
    ('00000000-0000-0000-0000-000000000104', '회계원', 'ACCOUNTANT 기본 권한그룹', FALSE, FALSE,
     NOW(), 'v43-seed-role-groups', NOW(), 'v43-seed-role-groups', FALSE),
    ('00000000-0000-0000-0000-000000000105', '재고원', 'INVENTORY 기본 권한그룹', FALSE, FALSE,
     NOW(), 'v43-seed-role-groups', NOW(), 'v43-seed-role-groups', FALSE),
    ('00000000-0000-0000-0000-000000000106', '배차담당자', 'DISPATCH 기본 권한그룹', FALSE, FALSE,
     NOW(), 'v43-seed-role-groups', NOW(), 'v43-seed-role-groups', FALSE),
    ('00000000-0000-0000-0000-000000000107', '기사', 'DRIVER 기본 권한그룹', FALSE, FALSE,
     NOW(), 'v43-seed-role-groups', NOW(), 'v43-seed-role-groups', FALSE),
    ('00000000-0000-0000-0000-000000000108', '사원', 'STAFF 기본 권한그룹', FALSE, FALSE,
     NOW(), 'v43-seed-role-groups', NOW(), 'v43-seed-role-groups', FALSE),
    ('00000000-0000-0000-0000-000000000109', '개발자', 'DEVELOPER 기본 권한그룹', FALSE, FALSE,
     NOW(), 'v43-seed-role-groups', NOW(), 'v43-seed-role-groups', FALSE)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    is_builtin = EXCLUDED.is_builtin,
    is_system_master = EXCLUDED.is_system_master,
    modified_at = NOW(),
    modified_by = 'v43-seed-role-groups';

INSERT INTO group_page_permissions
    (id, group_id, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
SELECT
    gen_random_uuid(),
    role_groups.group_id,
    t.page_code,
    t.can_view,
    t.can_create,
    t.can_update,
    t.can_delete,
    t.can_restore,
    t.can_download,
    t.can_print,
    NOW(),
    'v43-seed-role-groups',
    NOW(),
    'v43-seed-role-groups',
    FALSE
FROM role_page_permission_templates t
JOIN (
    VALUES
        ('MANAGER',    '00000000-0000-0000-0000-000000000101'::uuid),
        ('SALES',      '00000000-0000-0000-0000-000000000102'::uuid),
        ('WAREHOUSE',  '00000000-0000-0000-0000-000000000103'::uuid),
        ('ACCOUNTANT', '00000000-0000-0000-0000-000000000104'::uuid),
        ('INVENTORY',  '00000000-0000-0000-0000-000000000105'::uuid),
        ('DISPATCH',   '00000000-0000-0000-0000-000000000106'::uuid),
        ('DRIVER',     '00000000-0000-0000-0000-000000000107'::uuid),
        ('STAFF',      '00000000-0000-0000-0000-000000000108'::uuid),
        ('DEVELOPER',  '00000000-0000-0000-0000-000000000109'::uuid)
) AS role_groups(role_code, group_id)
  ON role_groups.role_code = t.role_code
WHERE t.is_deleted = FALSE
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO NOTHING;
