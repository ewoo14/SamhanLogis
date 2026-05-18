# SP-D4 도메인 정합성 검증

> 작성일: 2026-05-18
> 작성자: QA (Claude)
> 검증 범위: 22 PageCode × 7 ROLE = 154 seed row 4-way 정합 (mock.ts ↔ V10 seed ↔ PageCode enum ↔ controller)

---

## 개요

SP-D4 에서 신규 추가된 22 PageCode 에 대해 다음 4가지 소스가 서로 일치하는지 확인한다:

1. **mock.ts**: `clients/desktop/src/renderer/api/mock.ts` 의 역할별 permissions 배열
2. **V10 seed**: `V10__sp_d4_remaining_domains_page_permissions.sql` 의 154 row
3. **PageCode enum**: `services/auth-service/.../PageCode.java` 의 22 상수
4. **controller**: 각 도메인 서비스 PermissionGuard 호출 (`checkView/checkEdit`)

---

## 22 PageCode × 7 ROLE 매트릭스 (§2 카탈로그 기준)

V=canView, E=canEdit, -=both FALSE

| pageCode | MASTER | MANAGER | ACCOUNTANT | SALES | WAREHOUSE | DISPATCH | INVENTORY |
|---|---|---|---|---|---|---|---|
| `estimates.list` | V/E | V/E | V | V/E | - | - | - |
| `sales.partner-order.list` | V/E | V/E | V | V/E | - | - | - |
| `sales.partner-order.draft` | V/E | V/E | - | V/E | - | - | - |
| `sales.partner-order.confirm` | V/E | V/E | - | V/E | - | - | - |
| `sales.partner-order.history` | V/E | V | V | V | - | - | - |
| `sales.partner-order.print` | V/E | V | - | V/E | V | - | - |
| `sales.vendor-order` | V/E | V/E | - | V/E | V | - | - |
| `inventory.warehouse` | V/E | V/E | - | - | V/E | - | V/E |
| `inventory.stock` | V/E | V | V | V | V/E | V | V/E |
| `inventory.stock-transfer` | V/E | V/E | - | - | V/E | - | V/E |
| `inventory.dps` | V/E | V | - | - | V/E | - | V/E |
| `inventory.audit` | V/E | V | V | - | V | - | V |
| `admin.employees` | V/E | V/E | - | - | - | - | - |
| `admin.users` | V/E | - | - | - | - | - | - |
| `partners.list` | V/E | V/E | V | V/E | - | - | - |
| `partners.detail` | V/E | V/E | V | V/E | - | - | - |
| `partners.block` | V/E | V/E | - | - | - | - | - |
| `partners.edit-request` | V/E | V/E | - | V | - | - | - |
| `products.list` | V/E | V/E | V | V | V | - | V |
| `products.admin` | V/E | V/E | - | V/E | - | - | V/E |
| `arologis.admin` | V/E | V/E | - | - | - | V/E | - |
| `arologis.region` | V/E | V/E | - | - | - | V/E | - |

---

## 4-way 정합 Cross-Check SQL

### 1. V10 seed row 수 검증

```sql
-- V10 seed 총 154 row 확인 (22 PageCode × 7 ROLE)
SELECT COUNT(*) AS total_rows
FROM role_page_permissions
WHERE page_code IN (
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm', 'sales.partner-order.history', 'sales.partner-order.print',
    'sales.vendor-order', 'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps', 'inventory.audit', 'admin.employees', 'admin.users',
    'partners.list', 'partners.detail', 'partners.block', 'partners.edit-request',
    'products.list', 'products.admin', 'arologis.admin', 'arologis.region'
)
AND is_deleted = FALSE;
-- 기대값: 154
```

### 2. 각 PageCode 별 ROLE 매핑 수 검증

```sql
-- 각 pageCode 별 ROLE 수 확인 (V/E 조합 기준 §2 카탈로그)
SELECT page_code, COUNT(*) AS role_count
FROM role_page_permissions
WHERE page_code IN (
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm', 'sales.partner-order.history', 'sales.partner-order.print',
    'sales.vendor-order', 'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps', 'inventory.audit', 'admin.employees', 'admin.users',
    'partners.list', 'partners.detail', 'partners.block', 'partners.edit-request',
    'products.list', 'products.admin', 'arologis.admin', 'arologis.region'
)
AND is_deleted = FALSE
GROUP BY page_code
ORDER BY page_code;
-- 기대값 (§2 카탈로그 기준, FALSE row 포함 전체):
-- estimates.list: 7, sales.partner-order.list: 7, ... (총 22 × 7 = 154)
```

### 3. MASTER 전체 V/E TRUE 검증

```sql
-- MASTER 는 22 PageCode 모두 can_view=TRUE, can_edit=TRUE
SELECT page_code, can_view, can_edit
FROM role_page_permissions
WHERE role_code = 'MASTER'
  AND page_code IN (
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm', 'sales.partner-order.history', 'sales.partner-order.print',
    'sales.vendor-order', 'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps', 'inventory.audit', 'admin.employees', 'admin.users',
    'partners.list', 'partners.detail', 'partners.block', 'partners.edit-request',
    'products.list', 'products.admin', 'arologis.admin', 'arologis.region'
  )
  AND is_deleted = FALSE
  AND (can_view = FALSE OR can_edit = FALSE);
-- 기대값: 0 rows (MASTER 는 모두 TRUE)
```

### 4. admin.users MASTER 전용 검증

```sql
-- admin.users 는 MASTER 만 view=TRUE, 나머지 6 ROLE 은 FALSE
SELECT role_code, can_view, can_edit
FROM role_page_permissions
WHERE page_code = 'admin.users'
  AND is_deleted = FALSE
ORDER BY role_code;
-- 기대값:
--   MASTER: TRUE/TRUE
--   MANAGER: FALSE/FALSE
--   ACCOUNTANT: FALSE/FALSE
--   SALES: FALSE/FALSE
--   WAREHOUSE: FALSE/FALSE
--   DISPATCH: FALSE/FALSE
--   INVENTORY: FALSE/FALSE
```

### 5. arologis.admin DISPATCH/MASTER/MANAGER 전용 검증

```sql
-- arologis.admin 은 MASTER/MANAGER/DISPATCH 만 view=TRUE
SELECT role_code, can_view, can_edit
FROM role_page_permissions
WHERE page_code = 'arologis.admin'
  AND is_deleted = FALSE
ORDER BY role_code;
-- 기대값:
--   MASTER: TRUE/TRUE, MANAGER: TRUE/TRUE, DISPATCH: TRUE/TRUE
--   나머지: FALSE/FALSE
```

### 6. Idempotency 검증 (V10 seed 2회 재실행)

```sql
-- ON CONFLICT DO NOTHING 보장 검증: V10 seed 2회 적용 후 row 수 동일
-- V10 SQL 재실행 후:
SELECT COUNT(*) FROM role_page_permissions
WHERE page_code IN ('estimates.list', 'arologis.admin', 'admin.users', ...)
  AND is_deleted = FALSE;
-- 기대값: 재실행 전과 동일 (ON CONFLICT ... DO NOTHING 동작)
```

### 7. PageCode enum ↔ V10 seed 정합

```sql
-- auth-service 의 PageCode.java 22 상수와 DB row 의 page_code 값 일치 확인
-- (Java side 검증 — PermissionSeedConsistencyTest)
SELECT DISTINCT page_code
FROM role_page_permissions
WHERE page_code NOT IN (
    'accounting.tax-invoice.emit-nts', 'accounting.tax-invoice.list',
    'accounting.deposit-match', 'accounting.daily-closing', 'accounting.general-ledger',
    'accounting.accounts', 'accounting.journals', 'accounting.balances',
    'accounting.reports', 'accounting.period-close', 'accounting.statement-batch',
    'accounting.partner-ledger', 'notification.dispatch-sms.send-audit',
    'purchases.receipt-ocr', 'purchases.slip.list', 'sales.slip.list',
    'inbound.inspection', 'dispatch.board', 'admin.permissions',
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'sales.partner-order.confirm', 'sales.partner-order.history', 'sales.partner-order.print',
    'sales.vendor-order', 'inventory.warehouse', 'inventory.stock', 'inventory.stock-transfer',
    'inventory.dps', 'inventory.audit', 'admin.employees', 'admin.users',
    'partners.list', 'partners.detail', 'partners.block', 'partners.edit-request',
    'products.list', 'products.admin', 'arologis.admin', 'arologis.region'
    -- SP-D1~D3 기존 PageCode 도 추가 필요
)
AND created_by = 'system';
-- 기대값: 0 rows (알 수 없는 pageCode 없음)
```

---

## mock.ts ↔ V10 seed 4-way 정합 가이드

### 검증 대상 파일

```
mock.ts:    clients/desktop/src/renderer/api/mock.ts
V10 seed:   services/auth-service/src/main/resources/db/migration/V10__sp_d4_remaining_domains_page_permissions.sql
PageCode:   services/auth-service/src/.../domain/PageCode.java
controller: 각 도메인 서비스 PermissionGuard.checkView() / checkEdit() 호출
```

### 점검 체크리스트

| 검증 항목 | 방법 | 기대 결과 |
|---|---|---|
| mock.ts 22 PageCode 존재 | grep `estimates.list\|sales.partner-order\|inventory\.\|admin\.\|partners\.\|products\.\|arologis\.` mock.ts | 22개 모두 발견 |
| V10 SQL 154 row 존재 | SQL (위 §3.1) 실행 | COUNT=154 |
| MASTER 전체 TRUE | SQL (위 §3.3) 실행 | 0 rows |
| admin.users MASTER 전용 | SQL (위 §3.4) 실행 | MASTER만 TRUE |
| arologis.admin DISPATCH 포함 | SQL (위 §3.5) 실행 | DISPATCH TRUE |
| PageCode enum 22 상수 | Java grep `ESTIMATES_LIST\|PARTNER_ORDER\|INVENTORY\|ADMIN_USERS\|AROLOGIS` | 22개 발견 |
| PermissionGuard 7개 신규 | find *PermissionGuard.java SP-D4 신규 7개 | 7개 발견 |
| controller @RequestHeader | grep `X-User-Role` controller 파일 | 각 endpoint 에 존재 |
| Idempotency | V10 SQL 2회 실행 후 COUNT 동일 | 동일값 유지 |

---

## PermissionSeedConsistencyTest 검증 (BE 작성 의무)

plan §4 에 명시된 `PermissionSeedConsistencyTest` (mock.ts ↔ V10 cross-check) 가 BE agent 에 의해 작성되어야 함.

QA 검토 기준:
- `PageCode.values()` 배열과 DB `role_page_permissions.page_code` DISTINCT 값 일치
- SP-D4 22 신규 PageCode 모두 enum 상수 존재 확인
- V10 seed row = `PageCode.values().length × 7` (SP-D4 신규 22개 × 7 ROLE = 154)

---

## BaseEntity 7 audit 필드 검증

V10 seed 의 모든 154 row 가 BaseEntity 7 audit 필드를 포함해야 함:

```sql
-- audit 필드 누락 row 검증
SELECT COUNT(*) AS audit_missing
FROM role_page_permissions
WHERE (created_at IS NULL OR created_by IS NULL
    OR modified_at IS NULL OR modified_by IS NULL
    OR is_deleted IS NULL)
  AND page_code IN (
    'estimates.list', 'sales.partner-order.list', 'sales.partner-order.draft',
    'arologis.admin', 'arologis.region'  -- 대표 샘플
  );
-- 기대값: 0 rows (모든 audit 필드 non-null)
```
