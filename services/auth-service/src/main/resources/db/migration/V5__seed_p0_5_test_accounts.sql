-- V5__seed_p0_5_test_accounts.sql
-- Phase 10 P0-5 — 사용자/권한 관리 검증용 dev test 계정 시드.
--
-- [DEV-SEED] 식별자 — production 절대 미적용 (Flyway location 분리 필요 시 별도 조치).
--
-- 비밀번호 BCrypt 해시: QA_DEV_DEFAULT_PASSWORD
--   → $2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu
--
-- UUID 배정 규칙 (결정적):
--   MASTER      : a0000000-0000-0000-0000-000000000001
--   DEVELOPER   : a0000000-0000-0000-0000-000000000002
--   MANAGER     : a0000000-0000-0000-0000-000000000003
--   SALES       : a0000000-0000-0000-0000-000000000004
--   ACCOUNTANT  : a0000000-0000-0000-0000-000000000005
--   WAREHOUSE   : a0000000-0000-0000-0000-000000000006
--   INVENTORY   : a0000000-0000-0000-0000-000000000007
--   LOCKED      : a0000000-0000-0000-0000-000000000008  (failed_login_attempts=5, locked_at 설정)
--   DISABLED    : a0000000-0000-0000-0000-000000000009  (is_deleted=TRUE, Soft Delete)
--
-- password_change_required = TRUE — 첫 로그인 시 비밀번호 변경 의무 (P0-5 신규 등록 정책).
--
-- GitGuardian 주의: QA_DEV_DEFAULT_PASSWORD 는 DEV-ONLY 시드 전용. BCrypt hash 만 저장.

INSERT INTO accounts (
    id, login_id, password_hash, display_name, role, enabled,
    failed_login_attempts, locked_at,
    password_changed_at, password_history,
    password_change_required,
    created_at, created_by, is_deleted
) VALUES
-- [DEV-SEED] MASTER 계정
(
    'a0000000-0000-0000-0000-000000000001',
    'dev_master',
    '$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu',
    '[DEV-SEED] 개발마스터',
    'MASTER',
    TRUE,
    0, NULL,
    NOW(), '[]'::jsonb,
    TRUE,
    NOW(), 'system', FALSE
),
-- [DEV-SEED] DEVELOPER 계정
(
    'a0000000-0000-0000-0000-000000000002',
    'dev_developer',
    '$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu',
    '[DEV-SEED] 개발개발자',
    'DEVELOPER',
    TRUE,
    0, NULL,
    NOW(), '[]'::jsonb,
    TRUE,
    NOW(), 'system', FALSE
),
-- [DEV-SEED] MANAGER 계정
(
    'a0000000-0000-0000-0000-000000000003',
    'dev_manager',
    '$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu',
    '[DEV-SEED] 개발매니저',
    'MANAGER',
    TRUE,
    0, NULL,
    NOW(), '[]'::jsonb,
    TRUE,
    NOW(), 'system', FALSE
),
-- [DEV-SEED] SALES 계정
(
    'a0000000-0000-0000-0000-000000000004',
    'dev_sales',
    '$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu',
    '[DEV-SEED] 개발영업',
    'SALES',
    TRUE,
    0, NULL,
    NOW(), '[]'::jsonb,
    TRUE,
    NOW(), 'system', FALSE
),
-- [DEV-SEED] ACCOUNTANT 계정
(
    'a0000000-0000-0000-0000-000000000005',
    'dev_accountant',
    '$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu',
    '[DEV-SEED] 개발회계',
    'ACCOUNTANT',
    TRUE,
    0, NULL,
    NOW(), '[]'::jsonb,
    TRUE,
    NOW(), 'system', FALSE
),
-- [DEV-SEED] WAREHOUSE 계정
(
    'a0000000-0000-0000-0000-000000000006',
    'dev_warehouse',
    '$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu',
    '[DEV-SEED] 개발창고',
    'WAREHOUSE',
    TRUE,
    0, NULL,
    NOW(), '[]'::jsonb,
    TRUE,
    NOW(), 'system', FALSE
),
-- [DEV-SEED] INVENTORY 계정
(
    'a0000000-0000-0000-0000-000000000007',
    'dev_inventory',
    '$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu',
    '[DEV-SEED] 개발재고',
    'INVENTORY',
    TRUE,
    0, NULL,
    NOW(), '[]'::jsonb,
    TRUE,
    NOW(), 'system', FALSE
),
-- [DEV-SEED] LOCKED 계정 — 로그인 5회 실패 잠금 상태 검증용
(
    'a0000000-0000-0000-0000-000000000008',
    'dev_locked',
    '$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu',
    '[DEV-SEED] 잠금사용자',
    'SALES',
    TRUE,
    5, NOW(),
    NOW(), '[]'::jsonb,
    FALSE,
    NOW(), 'system', FALSE
),
-- [DEV-SEED] DISABLED 계정 — Soft Delete (탈퇴) 상태 검증용
(
    'a0000000-0000-0000-0000-000000000009',
    'dev_disabled',
    '$2a$12$6cxHjNrguvlnEE.4s4jrAOuGNGGmHPc4Gg8/MuMBHYh/B.Q4sU/xu',
    '[DEV-SEED] 탈퇴사용자',
    'SALES',
    FALSE,
    0, NULL,
    NOW(), '[]'::jsonb,
    FALSE,
    NOW(), 'system', TRUE
)
ON CONFLICT (id) DO NOTHING;
