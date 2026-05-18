# SP-D1 도메인 정합성 검증 (SQL)

> 슬라이스: SP-D1 동적 RBAC 권한 매트릭스
> DB: auth-service PostgreSQL (`auth_db`)
> 테이블: `role_page_permissions`
>
> SP-D1 cycle 2 fix: 테이블명/컬럼명을 실제 DDL(V7)과 일치시킴.

---

## 1. role_page_permissions 테이블 seed 정합성

### 1-1. 7역할 × 12페이지 = 84셀 완전성 확인

```sql
-- 전체 활성 셀 수 84개 확인
SELECT COUNT(*) AS cell_count
FROM role_page_permissions
WHERE is_deleted = FALSE;
-- 기대값: 84

-- 역할별 셀 수 12개 일관 확인
SELECT role_code, COUNT(*) AS page_count
FROM role_page_permissions
WHERE is_deleted = FALSE
GROUP BY role_code
ORDER BY role_code;
-- 기대값: 각 역할마다 12개
-- 역할: MASTER / MANAGER / ACCOUNTANT / SALES / WAREHOUSE / DISPATCH / INVENTORY
```

### 1-2. 역할 코드 유효값 확인

```sql
-- 유효하지 않은 role_code 존재 여부
SELECT role_code
FROM role_page_permissions
WHERE role_code NOT IN (
  'MASTER', 'MANAGER', 'ACCOUNTANT', 'SALES',
  'WAREHOUSE', 'DISPATCH', 'INVENTORY'
)
AND is_deleted = FALSE;
-- 기대값: 0건 (빈 결과)
```

### 1-3. 페이지 코드 유효값 확인 (BE PageCode enum dot-separated code)

```sql
-- 유효하지 않은 page_code 존재 여부
SELECT page_code
FROM role_page_permissions
WHERE page_code NOT IN (
  'accounting.tax-invoice.emit-nts',
  'accounting.tax-invoice.list',
  'accounting.deposit-match',
  'accounting.daily-closing',
  'accounting.general-ledger',
  'notification.dispatch-sms.send-audit',
  'purchases.receipt-ocr',
  'purchases.slip.list',
  'sales.slip.list',
  'inbound.inspection',
  'dispatch.board',
  'admin.permissions'
)
AND is_deleted = FALSE;
-- 기대값: 0건
```

### 1-4. (role_code, page_code) 유니크 제약 확인

```sql
-- 중복 (role_code, page_code) 확인
SELECT role_code, page_code, COUNT(*) AS cnt
FROM role_page_permissions
WHERE is_deleted = FALSE
GROUP BY role_code, page_code
HAVING COUNT(*) > 1;
-- 기대값: 0건 (중복 없음)
```

---

## 2. 권한 비즈니스 불변량

### 2-1. MASTER 역할 전 권한 DB row 확인

MASTER 는 DB row 를 통해 full access 를 표현한다 (V7 seed 12행 존재).
BE DynamicPermissionService.getMyPermissions("MASTER") 는 DB row 유무에 무관하게
모든 PageCode 에 대해 canView=true / canEdit=true 를 반환하도록 hardcode 되어 있음.

```sql
-- MASTER seed row 12개 확인
SELECT COUNT(*) AS master_row_count
FROM role_page_permissions
WHERE role_code = 'MASTER' AND is_deleted = FALSE;
-- 기대값: 12

-- MASTER 는 모두 can_view=true, can_edit=true
SELECT page_code, can_view, can_edit
FROM role_page_permissions
WHERE role_code = 'MASTER' AND is_deleted = FALSE
ORDER BY page_code;
-- 기대값: 모든 12개 행에서 can_view=true, can_edit=true
```

### 2-2. SP-09 vendor 권한 seed 일관성 확인

```sql
-- ACCOUNTANT 의 NTS 발행 편집 허용 확인 (SP-09-1)
SELECT can_view, can_edit
FROM role_page_permissions
WHERE role_code = 'ACCOUNTANT'
  AND page_code = 'accounting.tax-invoice.emit-nts'
  AND is_deleted = FALSE;
-- 기대값: can_view=true, can_edit=true

-- SALES 의 OCR 영수증 기본값 확인 (SP-D1 초기 = false)
SELECT can_view, can_edit
FROM role_page_permissions
WHERE role_code = 'SALES'
  AND page_code = 'purchases.receipt-ocr'
  AND is_deleted = FALSE;
-- 기대값: can_view=false, can_edit=false

-- WAREHOUSE 의 입고 검수 편집 허용 확인
SELECT can_view, can_edit
FROM role_page_permissions
WHERE role_code = 'WAREHOUSE'
  AND page_code = 'inbound.inspection'
  AND is_deleted = FALSE;
-- 기대값: can_view=true, can_edit=true

-- DISPATCH 의 배차 보드 편집 허용 확인
SELECT can_view, can_edit
FROM role_page_permissions
WHERE role_code = 'DISPATCH'
  AND page_code = 'dispatch.board'
  AND is_deleted = FALSE;
-- 기대값: can_view=true, can_edit=true
```

---

## 3. Idempotency 검증 (seeder 2회 재실행 후 row count 동일)

```sql
-- V7 migration ON CONFLICT DO NOTHING 보장 확인:
-- Flyway 재실행 후 row count 84 유지 확인.
SELECT COUNT(*) FROM role_page_permissions WHERE is_deleted = FALSE;
-- 기대값: 84 (중복 삽입 없음)
```

---

## 4. batch update 원자성 (도메인 불변량)

PUT `/auth/admin/permissions/batch` (또는 POST `/auth/admin/permissions/batch`) 트랜잭션 rollback 시 DB 상태 이전과 동일:

```sql
-- batch update 실패 전후 특정 셀 상태 확인
SELECT can_view, can_edit, modified_at
FROM role_page_permissions
WHERE role_code = 'DISPATCH'
  AND page_code = 'accounting.deposit-match'
  AND is_deleted = FALSE;
-- 기대값: 원래 false 값 유지 (rollback 시)
```

---

## 5. BaseEntity 7 audit 필드 확인

```sql
-- role_page_permissions 테이블 audit 필드 완전성 확인
SELECT
  id IS NOT NULL                AS has_id,
  created_at IS NOT NULL        AS has_created_at,
  created_by IS NOT NULL        AS has_created_by,
  is_deleted IS NOT NULL        AS has_is_deleted
FROM role_page_permissions
LIMIT 5;
-- 기대값: 모든 has_* = true

-- modified_at / modified_by 는 갱신 시 채워짐 (초기 seed 는 NULL 허용)
SELECT
  role_code,
  page_code,
  modified_at,
  modified_by
FROM role_page_permissions
WHERE modified_at IS NOT NULL
LIMIT 5;
-- 기대값: 갱신된 행만 표시
```

---

## 6. MASTER update/delete 차단 확인

SP-D1 cycle 2 fix: DynamicPermissionService.updatePermission() / deletePermission() 에서
MASTER roleCode 변경/삭제를 BusinessException(FORBIDDEN) 으로 차단.

```sql
-- MASTER 행은 is_deleted=FALSE 이고 modified_at 이 갱신되지 않아야 함 (seed 이후 변경 없을 시)
SELECT role_code, page_code, modified_at, modified_by
FROM role_page_permissions
WHERE role_code = 'MASTER' AND is_deleted = FALSE AND modified_at IS NOT NULL;
-- 기대값: 0건 (MASTER 는 API 통해 변경 불가 — BE FORBIDDEN 가드)
```

> `project_build_conventions.md` — BaseEntity 7 audit fields mandatory.
> Soft Delete only: 실제 DELETE 금지, is_deleted=TRUE + deleted_at 갱신.
