-- [RC-USERS] 폐기된 role_snapshot 값 'MEMBER' 정규화 → 'STAFF'.
--
-- 배경: EcountEmployeeImporter 가 ecount '사원' 직원을 role_snapshot='MEMBER' 로 적재했으나,
-- 현행 Role enum(com.samhanair.logis.common.security.Role)에는 MEMBER 상수가 없어(STAFF 로 대체됨)
-- Employee 엔티티 하이드레이션 시 "No enum constant ... Role.MEMBER" → 사용자관리 목록 조회 500.
-- ecount '사원' = 일반 직원이므로 현행 STAFF 로 매핑한다. (임포터 코드도 동일하게 STAFF 로 수정)
UPDATE employees
SET role_snapshot = 'STAFF',
    modified_at = NOW(),
    modified_by = 'system-v9-role-normalize'
WHERE role_snapshot = 'MEMBER';
