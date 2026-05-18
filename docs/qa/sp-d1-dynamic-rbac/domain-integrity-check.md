# SP-D1 도메인 정합성 검증 (SQL)

> 슬라이스: SP-D1 동적 RBAC 권한 매트릭스
> DB: user-service PostgreSQL (`user_db`)

---

## 1. page_permission 테이블 seed 정합성

### 1-1. 7역할 × 12페이지 = 84셀 완전성 확인

```sql
-- 전체 셀 수 84개 확인
SELECT COUNT(*) AS cell_count
FROM page_permission
WHERE deleted_at IS NULL;
-- 기대값: 84

-- 역할별 셀 수 12개 일관 확인
SELECT role_code, COUNT(*) AS page_count
FROM page_permission
WHERE deleted_at IS NULL
GROUP BY role_code
ORDER BY role_code;
-- 기대값: 각 역할마다 12개
```

### 1-2. 역할 코드 유효값 확인

```sql
-- 유효하지 않은 role_code 존재 여부
SELECT role_code
FROM page_permission
WHERE role_code NOT IN (
  'DEVELOPER','MANAGER','DISPATCH','SALES',
  'ACCOUNTANT','WAREHOUSE','INVENTORY'
)
AND deleted_at IS NULL;
-- 기대값: 0건 (빈 결과)
```

### 1-3. 페이지 코드 유효값 확인

```sql
-- 유효하지 않은 page_code 존재 여부
SELECT page_code
FROM page_permission
WHERE page_code NOT IN (
  'DASHBOARD','WAREHOUSES','SALES','PURCHASES','TRANSFERS',
  'ACCOUNTING','AROLOGIS','WAREHOUSE_OPS','ADMIN',
  'DISPATCH_BOARD','PERMISSION_MATRIX','REPORTS'
)
AND deleted_at IS NULL;
-- 기대값: 0건
```

### 1-4. (role_code, page_code) 유니크 제약 확인

```sql
-- 중복 (role_code, page_code) 확인
SELECT role_code, page_code, COUNT(*) AS cnt
FROM page_permission
WHERE deleted_at IS NULL
GROUP BY role_code, page_code
HAVING COUNT(*) > 1;
-- 기대값: 0건 (중복 없음)
```

---

## 2. 권한 비즈니스 불변량

### 2-1. MASTER 역할 PERMISSION_MATRIX edit 허용 확인

MASTER 는 직접 page_permission 에 행이 없음 (BE 가 hardcode 전체 허용).
user-service `/admin/permissions` endpoint 는 MASTER 요청 시 항상 view+edit 반환 확인:

```sql
-- MASTER 가 page_permission 에 행을 갖지 않는 구조인지 확인
SELECT COUNT(*)
FROM page_permission
WHERE role_code = 'MASTER';
-- 기대값: 0 (MASTER 는 동적 매트릭스 대상 외 — 항상 full access)
```

### 2-2. SP-09 vendor 권한 seed 일관성 확인

SP-09 에서 검증한 권한 매트릭스 (NTS=ACCOUNTANT/MANAGER, OCR=WAREHOUSE/MANAGER 등) 와
page_permission seed 기본값 일관 확인:

```sql
-- ACCOUNTANT 의 ACCOUNTING view 허용 확인
SELECT view_allowed, edit_allowed
FROM page_permission
WHERE role_code = 'ACCOUNTANT' AND page_code = 'ACCOUNTING' AND deleted_at IS NULL;
-- 기대값: view_allowed=true, edit_allowed=true

-- SALES 의 PURCHASES view 기본값 확인 (SP-D1 초기 = false)
SELECT view_allowed, edit_allowed
FROM page_permission
WHERE role_code = 'SALES' AND page_code = 'PURCHASES' AND deleted_at IS NULL;
-- 기대값: view_allowed=false (OCR 미허용 기본값)

-- WAREHOUSE 의 WAREHOUSE_OPS view 허용 확인
SELECT view_allowed, edit_allowed
FROM page_permission
WHERE role_code = 'WAREHOUSE' AND page_code = 'WAREHOUSE_OPS' AND deleted_at IS NULL;
-- 기대값: view_allowed=true, edit_allowed=true
```

---

## 3. Idempotency 검증 (seeder 2회 재실행 후 row count 동일)

```sql
-- Flyway V_SPD1_001 seeder 2회 실행 후 row count 84 유지 확인
-- (INSERT ... ON CONFLICT DO UPDATE 패턴 의무)

-- seeder 재실행 후:
SELECT COUNT(*) FROM page_permission WHERE deleted_at IS NULL;
-- 기대값: 84 (중복 삽입 없음)
```

---

## 4. batch update 원자성 (도메인 불변량)

PUT `/admin/permissions` 트랜잭션 rollback 시 DB 상태 이전과 동일:

```sql
-- batch update 실패 전후 특정 셀 상태 확인
SELECT view_allowed, edit_allowed, updated_at
FROM page_permission
WHERE role_code = 'DISPATCH' AND page_code = 'ACCOUNTING' AND deleted_at IS NULL;
-- 기대값: 원래 false 값 유지 (rollback 시)
```

---

## 5. BaseEntity 7 audit 필드 확인

```sql
-- page_permission 테이블 audit 필드 완전성 확인
SELECT
  id IS NOT NULL AS has_id,
  created_at IS NOT NULL AS has_created_at,
  updated_at IS NOT NULL AS has_updated_at,
  created_by IS NOT NULL AS has_created_by,
  updated_by IS NOT NULL AS has_updated_by,
  deleted_at IS NULL AS is_not_deleted
FROM page_permission
LIMIT 5;
-- 기대값: 모든 has_* = true, is_not_deleted = true
```

> `project_build_conventions.md` — BaseEntity 7 audit fields mandatory.
> Soft Delete only: 실제 DELETE 금지, deleted_at 갱신.
