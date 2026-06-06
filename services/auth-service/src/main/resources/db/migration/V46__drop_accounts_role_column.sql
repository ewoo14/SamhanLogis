-- V46__drop_accounts_role_column.sql
-- C5-5: accounts.role 컬럼 물리 DROP — 인가 와이어 role 소멸 완료 단계.
--
-- 배경:
--   C5-4 에서 JWT role 클레임 미발급 처리 완료.
--   인가는 account_groups(빌트인 role-group UUID) + X-Is-System-Master 로 전담.
--   accounts.role 은 더 이상 인가·인증 경로에서 읽히지 않으므로 물리 컬럼을 제거한다.
--
-- 순서:
--   1. ix_accounts_role_active 인덱스 DROP (V1 에서 생성됨).
--   2. accounts.role 컬럼 DROP.
--
-- Flyway 안전성:
--   V5 (seed) 는 본 마이그레이션보다 앞 번호이므로,
--   신규 clean 적용 환경에서도 V5(role INSERT) → V46(DROP) 순서가 보장된다.
--
-- 락아웃 불변식 박제:
--   login 시 role 표시값은 account_groups ∩ 빌트인(BuiltinRoleGroupIds) 역매핑으로 파생한다.
--   역매핑 실패(그룹 미매칭)는 LoginResponse.role 을 빈 문자열로 처리하며,
--   실제 인증·인가는 X-User-Groups / X-Is-System-Master 가 전담하므로
--   로그아웃(lockout)이 발생하지 않는다.

-- Step 1: role 컬럼 기반 인덱스 제거
DROP INDEX IF EXISTS ix_accounts_role_active;

-- Step 2: role 컬럼 물리 DROP
ALTER TABLE accounts DROP COLUMN IF EXISTS role;
