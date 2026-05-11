# 도메인 정합성 검증 SQL — admin-hr-category-and-disabled-ux

슬라이스: `admin-hr-category-and-disabled-ux`
작성일: 2026-05-11
담당: QA agent
DB: `user_db` (PostgreSQL 16)

---

## 1. 대표실 부서 row count — 정확히 1 row 기대

```sql
-- 기대값: count = 1
-- 0 이면 V2 migration 누락 또는 soft-delete 오류
-- 2 이상이면 중복 insert 또는 명칭 혼용 (대표실 vs 경영지원 등)
SELECT
    id,
    code,
    name,
    display_order,
    is_deleted,
    created_at
FROM departments
WHERE name = '대표실'
  AND is_deleted = false;

-- 정합성 assertion:
-- SELECT COUNT(*) FROM departments WHERE name = '대표실' AND is_deleted = false;
-- => 기대: 1
```

---

## 2. 대표실 소속 user 수 (현 시점 분포)

```sql
-- 대표실(EXEC) 부서에 소속된 활성 직원 전체 목록
SELECT
    e.id            AS employee_id,
    e.login_id,
    e.full_name,
    e.role_snapshot AS role,
    d.code          AS dept_code,
    d.name          AS dept_name,
    e.hire_date,
    e.termination_date,
    e.is_deleted
FROM employees e
JOIN departments d ON d.id = e.department_id
WHERE d.name = '대표실'
  AND e.is_deleted = false
ORDER BY e.full_name;

-- 현 시점 기대:
--   최소 1명 (dev_master) — V5 seed 기준
--   termination_date IS NULL (퇴사 처리 없음)
```

---

## 3. MASTER ROLE 중 대표실 외 부서 소속 user list (잠재 가드 영향)

```sql
-- 대표실 가드 영향 분석: MASTER role 이지만 대표실이 아닌 직원
-- 이 목록에 속한 사용자는 인사 메뉴 접근이 차단됨 (TC-HR2 케이스)
-- 사전 파악 필수 — production 배포 전 부서 재배정 또는 예외 처리 결정 필요
SELECT
    e.id            AS employee_id,
    e.login_id,
    e.full_name,
    e.role_snapshot AS role,
    d.code          AS dept_code,
    d.name          AS dept_name
FROM employees e
JOIN departments d ON d.id = e.department_id
WHERE e.role_snapshot = 'MASTER'
  AND d.name != '대표실'
  AND e.is_deleted = false
ORDER BY d.name, e.full_name;

-- 기대:
--   dev seed 환경: MANAGER role 직원이 대표실 배정됨 (V5 참조)
--   현재 MASTER 는 dev_master 1명 → 대표실 소속 → 이 쿼리 결과 0건 기대
--   결과 1건 이상 시: 해당 직원 부서 재배정 검토 또는 예외 허용 정책 결정 필요
```

---

## 4. JWT departmentName claim 비교 SQL (legacy token 호환)

```sql
-- legacy 토큰에 departmentName claim 이 포함된 경우,
-- employees.department.name 과 일치 여부 검증 (cross-check)
--
-- user_db 측: 직원별 현재 부서명 조회
SELECT
    e.id            AS employee_id,
    e.login_id,
    d.name          AS current_dept_name,
    -- JWT claim 은 auth-service 에서 발급 시 snapshot 저장
    -- auth_db.accounts 테이블의 department_name_snapshot 컬럼과 비교
    -- (auth-service 미구현 시 cross-DB join 불가 → application 레벨 검증)
    e.role_snapshot AS role
FROM employees e
JOIN departments d ON d.id = e.department_id
WHERE e.is_deleted = false
ORDER BY e.login_id;

-- auth-service cross-DB 검증 (두 DB 모두 접근 가능한 DBA 환경 필요):
-- 아래 쿼리는 auth_db 에서 실행:
--
-- SELECT
--     a.id          AS account_id,
--     a.login_id,
--     a.department_name_snapshot AS jwt_dept_snapshot
-- FROM auth_db.accounts a
-- WHERE a.is_deleted = false
-- ORDER BY a.login_id;
--
-- 두 결과를 login_id 기준으로 대조:
--   user_db.current_dept_name != auth_db.jwt_dept_snapshot
--   => 부서 이동 후 토큰 미갱신 케이스 → 재로그인 유도 또는 토큰 무효화 정책 결정 필요
--
-- 현재 아키텍처(W11 이전): JWT departmentName claim 은 로그인 시 snapshot
--   → 부서 이동 후 재로그인 전까지 FE 가드는 구 departmentName 기준으로 동작
--   → TC-HR2 false negative 가능 — 운영 주의 사항
```

---

## 5. 사이드바 권한 정합성 — role별 허용 메뉴 기대표

```sql
-- employees table 에서 role 분포 확인
SELECT
    e.role_snapshot                           AS role,
    COUNT(*)                                  AS count,
    STRING_AGG(e.login_id, ', ' ORDER BY e.login_id) AS sample_login_ids
FROM employees e
WHERE e.is_deleted = false
GROUP BY e.role_snapshot
ORDER BY role;

-- 기대 role 별 사이드바 접근 가능 메뉴 (FE 구현 기준):
-- MASTER     + 대표실  : 전체 (인사 포함)
-- MASTER     + 非대표실: 인사 제외 전체
-- MANAGER              : 영업/창고/구매 + 일부 관리 (인사 X)
-- SALES                : 영업/구매 일부 (회계/인사/창고 X)
-- ACCOUNTANT           : 회계 전체 + 창고 마감 (영업 신규 X)
-- WAREHOUSE            : 창고/재고 (회계/인사 X)
-- DEVELOPER            : 전체 (개발 전용)
```

---

## 실행 환경

| 항목 | 값 |
|------|----|
| DB | user_db (PostgreSQL 16-alpine, Testcontainers or RDS) |
| 실행 방법 | psql, DBeaver, 또는 `docker exec -it user-db psql -U samhan -d user_db` |
| 관련 migration | V2__seed_org_chart.sql, V5__seed_p0_5_test_users.sql |

---

## 정합성 항목 요약

| 번호 | 항목 | 기대값 |
|------|------|--------|
| 1 | `departments WHERE name='대표실'` count | 정확히 1 |
| 2 | 대표실 소속 활성 직원 수 | >= 1 (dev_master 포함) |
| 3 | MASTER + 非대표실 직원 | 0 (dev seed 기준) |
| 4 | JWT departmentName claim vs DB 불일치 | 0 (재로그인 전 legacy 주의) |
| 5 | role 분포 (SALES/ACCOUNTANT/MASTER 등) | seed 기준 분포 확인 |
