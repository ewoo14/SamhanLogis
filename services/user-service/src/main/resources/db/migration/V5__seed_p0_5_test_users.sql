-- V5__seed_p0_5_test_users.sql
-- Phase 10 P0-5 — 사용자/권한 관리 검증용 dev test 직원 시드.
--
-- [DEV-SEED] 식별자 — production 절대 미적용.
--
-- auth-service.V5__seed_p0_5_test_accounts.sql 과 UUID 1:1 대응.
-- account_id = id (auth-service accounts.id 와 동일 값 — EmployeeProvisioningService 정책).
--
-- 부서 배정:
--   MASTER / DEVELOPER / MANAGER           → 대표실 (00000000-0000-0000-0000-000000000001)
--   SALES / LOCKED                         → 영업1팀 (00000000-0000-0000-0000-000000000002)
--   ACCOUNTANT                             → 회계팀  (00000000-0000-0000-0000-000000000005)
--   WAREHOUSE / INVENTORY                  → 영업2팀 (00000000-0000-0000-0000-000000000003) *창고/재고팀 미존재 — 임시
--   DISABLED (soft-deleted employee)       → 영업1팀 (is_deleted=TRUE)
--
-- hire_date = 2026-01-01 (Employee.DEFAULT_HIRE_DATE — 시간 의존 회귀 회피 상수).

INSERT INTO employees (
    id, account_id, login_id, full_name, job_title, role_snapshot,
    department_id, is_team_lead,
    hire_date, termination_date,
    email, phone,
    created_at, created_by, is_deleted
) VALUES
-- [DEV-SEED] MASTER
(
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'dev_master',
    '[DEV-SEED] 개발마스터',
    '대표',
    'MASTER',
    '00000000-0000-0000-0000-000000000001',
    TRUE,
    '2026-01-01', NULL,
    'dev_master@samhan-air.com', '010-0000-0001',
    NOW(), 'system', FALSE
),
-- [DEV-SEED] DEVELOPER
(
    'a0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    'dev_developer',
    '[DEV-SEED] 개발개발자',
    '개발자',
    'DEVELOPER',
    '00000000-0000-0000-0000-000000000001',
    FALSE,
    '2026-01-01', NULL,
    'dev_developer@samhan-air.com', '010-0000-0002',
    NOW(), 'system', FALSE
),
-- [DEV-SEED] MANAGER
(
    'a0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000003',
    'dev_manager',
    '[DEV-SEED] 개발매니저',
    '부장',
    'MANAGER',
    '00000000-0000-0000-0000-000000000001',
    FALSE,
    '2026-01-01', NULL,
    'dev_manager@samhan-air.com', '010-0000-0003',
    NOW(), 'system', FALSE
),
-- [DEV-SEED] SALES
(
    'a0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000004',
    'dev_sales',
    '[DEV-SEED] 개발영업',
    '사원',
    'SALES',
    '00000000-0000-0000-0000-000000000002',
    FALSE,
    '2026-01-01', NULL,
    'dev_sales@samhan-air.com', '010-0000-0004',
    NOW(), 'system', FALSE
),
-- [DEV-SEED] ACCOUNTANT
(
    'a0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000005',
    'dev_accountant',
    '[DEV-SEED] 개발회계',
    '사원',
    'ACCOUNTANT',
    '00000000-0000-0000-0000-000000000005',
    FALSE,
    '2026-01-01', NULL,
    'dev_accountant@samhan-air.com', '010-0000-0005',
    NOW(), 'system', FALSE
),
-- [DEV-SEED] WAREHOUSE
(
    'a0000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000006',
    'dev_warehouse',
    '[DEV-SEED] 개발창고',
    '사원',
    'WAREHOUSE',
    '00000000-0000-0000-0000-000000000003',
    FALSE,
    '2026-01-01', NULL,
    'dev_warehouse@samhan-air.com', '010-0000-0006',
    NOW(), 'system', FALSE
),
-- [DEV-SEED] INVENTORY
(
    'a0000000-0000-0000-0000-000000000007',
    'a0000000-0000-0000-0000-000000000007',
    'dev_inventory',
    '[DEV-SEED] 개발재고',
    '사원',
    'INVENTORY',
    '00000000-0000-0000-0000-000000000003',
    FALSE,
    '2026-01-01', NULL,
    'dev_inventory@samhan-air.com', '010-0000-0007',
    NOW(), 'system', FALSE
),
-- [DEV-SEED] LOCKED 상태 직원 — auth-service 계정은 locked_at 설정, employee 는 정상 active
(
    'a0000000-0000-0000-0000-000000000008',
    'a0000000-0000-0000-0000-000000000008',
    'dev_locked',
    '[DEV-SEED] 잠금사용자',
    '사원',
    'SALES',
    '00000000-0000-0000-0000-000000000002',
    FALSE,
    '2026-01-01', NULL,
    'dev_locked@samhan-air.com', '010-0000-0008',
    NOW(), 'system', FALSE
),
-- [DEV-SEED] DISABLED — Soft Delete (탈퇴) 직원. is_deleted=TRUE, termination_date 설정
(
    'a0000000-0000-0000-0000-000000000009',
    'a0000000-0000-0000-0000-000000000009',
    'dev_disabled',
    '[DEV-SEED] 탈퇴사용자',
    '사원',
    'SALES',
    '00000000-0000-0000-0000-000000000002',
    FALSE,
    '2026-01-01', '2026-03-31',
    'dev_disabled@samhan-air.com', '010-0000-0009',
    NOW(), 'system', TRUE
)
ON CONFLICT (id) DO NOTHING;
