-- V45__seed_hr_role_management_page.sql
-- Permission Groups Phase B: 인사 역할관리(hr.role-management) 관리 page-code 분리.
--
-- 신규 page: hr.role-management
--   - 역할변경/퇴사(EmployeeController updateRole/terminate) 전용 고위험 권한.
--   - admin.employees 는 일반 직원관리용으로 유지해 MANAGER 직원정보 수정 권한이
--     역할변경/퇴사로 확장되지 않도록 분리한다.
--   - 기본 seed 는 MASTER-only. MASTER 는 PermissionAspect bypass 로 통과하므로
--     account_page_permissions materialize 는 하지 않는다.
--   - V43 MASTER 시스템그룹도 bypass 전용이므로 group_page_permissions 에 추가하지 않는다.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

INSERT INTO role_page_permission_templates
    (id, role_code, page_code,
     can_view, can_create, can_update, can_delete, can_restore, can_download, can_print,
     created_at, created_by, modified_at, modified_by, is_deleted)
VALUES
    (gen_random_uuid(), 'MASTER', 'hr.role-management',
     TRUE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE,
     NOW(), 'v45-phase-b-delegation', NOW(), 'v45-phase-b-delegation', FALSE)
ON CONFLICT (role_code, page_code) WHERE is_deleted = FALSE DO NOTHING;
