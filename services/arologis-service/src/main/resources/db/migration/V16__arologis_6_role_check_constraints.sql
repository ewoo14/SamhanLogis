-- V16__arologis_6_role_check_constraints.sql
-- 아로로지스 6-롤 모델 (개발책임자 2026-06-08) — CHECK 제약 확장.
--
-- AdminUserRole enum 이 2롤 → 6롤(AROLOGIS_MASTER/MANAGER/DEVELOPER/SALES/ACCOUNTANT/DRIVER)로
-- 확장됨. V7(auth_admin_user.role) / V14(arologis_role_change_history.previous_role/new_role)의
-- 기존 2롤 CHECK 제약이 신규 롤 INSERT 를 거부하므로(role_check 위반) 6롤로 재정의한다.
-- 실 QA 에서 AROLOGIS_ACCOUNTANT 직원 생성 시 auth_admin_user_role_check 위반 발견 후 보강.

-- 6롤 허용 목록(공통)
-- ('AROLOGIS_MASTER','AROLOGIS_MANAGER','AROLOGIS_DEVELOPER','AROLOGIS_SALES','AROLOGIS_ACCOUNTANT','AROLOGIS_DRIVER')

-- (1) auth_admin_user.role
ALTER TABLE auth_admin_user DROP CONSTRAINT IF EXISTS auth_admin_user_role_check;
ALTER TABLE auth_admin_user
    ADD CONSTRAINT auth_admin_user_role_check
    CHECK (role IN ('AROLOGIS_MASTER', 'AROLOGIS_MANAGER', 'AROLOGIS_DEVELOPER',
                    'AROLOGIS_SALES', 'AROLOGIS_ACCOUNTANT', 'AROLOGIS_DRIVER'));

-- (2) arologis_role_change_history.new_role (NOT NULL)
ALTER TABLE arologis_role_change_history DROP CONSTRAINT IF EXISTS arologis_role_change_history_new_role_check;
ALTER TABLE arologis_role_change_history
    ADD CONSTRAINT arologis_role_change_history_new_role_check
    CHECK (new_role IN ('AROLOGIS_MASTER', 'AROLOGIS_MANAGER', 'AROLOGIS_DEVELOPER',
                        'AROLOGIS_SALES', 'AROLOGIS_ACCOUNTANT', 'AROLOGIS_DRIVER'));

-- (3) arologis_role_change_history.previous_role (nullable)
ALTER TABLE arologis_role_change_history DROP CONSTRAINT IF EXISTS arologis_role_change_history_previous_role_check;
ALTER TABLE arologis_role_change_history
    ADD CONSTRAINT arologis_role_change_history_previous_role_check
    CHECK (previous_role IS NULL OR previous_role IN ('AROLOGIS_MASTER', 'AROLOGIS_MANAGER',
                    'AROLOGIS_DEVELOPER', 'AROLOGIS_SALES', 'AROLOGIS_ACCOUNTANT', 'AROLOGIS_DRIVER'));
