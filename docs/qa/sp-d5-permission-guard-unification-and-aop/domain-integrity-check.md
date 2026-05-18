# SP-D5 도메인 정합성 검증 — SQL

> 작성일: 2026-05-19
> 담당: QA Agent
> 관련 DB: auth-service DB (`role_page_permissions` 테이블)
> 관련 서비스: shared/security (AOP), slip-service, user-service, product-service, partner-service, partner-order-service, inventory-service, arologis-service

---

## 개요

SP-D5 는 `@RequirePermission(page, action)` 어노테이션과 `PermissionAspect` AOP 를 도입하여
SP-D1~D4 에서 분산된 `checkView/checkEdit` 직접 호출을 통합한다.

도메인 정합성은 다음 세 축으로 검증한다:
1. `@RequirePermission` 의 `page` 값 → `role_page_permissions.page_code` 1:1 일치
2. `@RequirePermission` 의 `action` 값 → `VIEW` / `EDIT` 두 종류만
3. `PermissionGuardMetrics` Counter 의 `service` 태그 → 각 서비스 `spring.application.name` 일치

---

## 1. @RequirePermission page 값 ↔ role_page_permissions.page_code 정합 확인

SP-D5 마이그레이션 대상 ~25 endpoint 에 적용된 `@RequirePermission(page=...)` 값이
auth-service DB 의 `role_page_permissions.page_code` 에 존재해야 한다.

```sql
-- SP-D1~D4 누적 등록된 전체 page_code 목록 확인 (V7+V8+V9+V10 seed 기준)
SELECT DISTINCT page_code
FROM role_page_permissions
WHERE is_deleted = FALSE
ORDER BY page_code;

-- 기대 결과 (V7 12개 + V8 회계 보강 + V9 fix + V10 22개 = 총 41개 이상):
-- accounting.accounts
-- accounting.balances
-- accounting.daily-closing
-- accounting.deposit-match
-- accounting.general-ledger
-- accounting.journals
-- accounting.partner-ledger
-- accounting.period-close
-- accounting.reports
-- accounting.statement-batch
-- accounting.tax-invoice.emit-nts
-- accounting.tax-invoice.list
-- admin.employees
-- admin.permissions
-- admin.users
-- arologis.admin
-- dispatch.board
-- estimates.list
-- inbound.inspection
-- inventory.audit
-- inventory.warehouses
-- notification.dispatch-sms.send-audit
-- partners.block
-- partners.detail
-- partners.edit-request
-- partners.list
-- products.admin
-- purchases.receipt-ocr
-- purchases.slip.list
-- sales.partner-order.confirm
-- sales.partner-order.draft
-- sales.partner-order.edit-request
-- sales.partner-order.history
-- sales.partner-order.list
-- sales.partner-order.print
-- sales.slip.list
-- ...
```

---

## 2. @RequirePermission 마이그레이션 대상 endpoint × page_code 1:1 정합 확인

SP-D5 에서 `@RequirePermission` 어노테이션이 적용된 endpoint 의 `page` 값이
DB page_code 에 1:1 대응되는지 확인한다.

```sql
-- SP-D1~D4 에서 guard 가 적용된 page_code 목록 (마이그레이션 대상)
-- @RequirePermission(page=X) 값이 아래 목록에 모두 포함되어야 함
SELECT page_code, COUNT(*) AS role_count
FROM role_page_permissions
WHERE page_code IN (
    'estimates.list',
    'sales.partner-order.list',
    'sales.partner-order.draft',
    'sales.partner-order.confirm',
    'sales.partner-order.history',
    'sales.partner-order.print',
    'sales.partner-order.edit-request',
    'inventory.warehouses',
    'inventory.audit',
    'admin.employees',
    'admin.users',
    'partners.list',
    'partners.detail',
    'partners.block',
    'partners.edit-request',
    'products.admin',
    'arologis.admin',
    'dispatch.board',
    'purchases.slip.list',
    'sales.slip.list',
    'notification.dispatch-sms.send-audit',
    'purchases.receipt-ocr',
    'inbound.inspection',
    'admin.permissions'
)
  AND is_deleted = FALSE
GROUP BY page_code
ORDER BY page_code;

-- 기대 결과:
-- 모든 page_code 에 대해 role_count >= 2 (MASTER + 해당 역할 최소 1개)
-- @RequirePermission page 값 중 DB 미등록 항목 0건
```

---

## 3. @RequirePermission action 값 유효성 확인 — VIEW / EDIT 두 종류만

`@RequirePermission` annotation 의 `action` 속성은 `VIEW` / `EDIT` 두 값만 허용한다.
코드 레벨 검증 (grep):

```bash
# @RequirePermission 어노테이션 action 값 전체 목록 (services/ 하위)
grep -r "@RequirePermission" services/ --include="*.java" -h \
  | grep -oP 'action\s*=\s*"[^"]+"' \
  | sort | uniq -c

# 기대 결과:
#   N action="VIEW"
#   M action="EDIT"
# 기타 값 0건 (예: "READ", "WRITE", "DELETE" 미존재)
```

DB 레벨 — `role_page_permissions` 은 `can_view` / `can_edit` Boolean 컬럼으로 구성되어 있으므로
`VIEW` → `can_view`, `EDIT` → `can_edit` 매핑 적절성 확인:

```sql
-- can_view / can_edit 컬럼 타입 및 제약 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'role_page_permissions'
  AND column_name IN ('can_view', 'can_edit')
ORDER BY column_name;

-- 기대 결과:
-- can_edit | boolean | NO
-- can_view | boolean | NO
```

---

## 4. service 태그 값 ↔ spring.application.name 일치 확인

`PermissionGuardMetrics` Counter 의 `service` 레이블 값은 각 서비스의
`spring.application.name` 설정과 1:1 일치해야 한다.

```sql
-- NOTE: spring.application.name 은 application.yml 파일 기반 — SQL 직접 검증 불가
-- 아래는 서비스별 기대 매핑 목록 (수동 확인 체크리스트)
```

| 서비스 경로 | spring.application.name | Counter service 태그 |
|------------|-------------------------|----------------------|
| `services/slip-service` | `slip-service` | `service="slip-service"` |
| `services/user-service` | `user-service` | `service="user-service"` |
| `services/product-service` | `product-service` | `service="product-service"` |
| `services/partner-service` | `partner-service` | `service="partner-service"` |
| `services/partner-order-service` | `partner-order-service` | `service="partner-order-service"` |
| `services/inventory-service` | `inventory-service` | `service="inventory-service"` |
| `services/arologis-service` | `arologis-service` | `service="arologis-service"` |
| `services/accounting-service` | `accounting-service` | `service="accounting-service"` |
| `services/notification-service` | `notification-service` | `service="notification-service"` |

**검증 방법**:
```bash
# 각 서비스 application.yml 의 spring.application.name 확인
grep -r "application.name" services/ --include="application.yml" -h | sort

# PermissionAspect 내 Counter.builder() 호출의 tag("service", ...) 값 확인
grep -r "Counter.builder\|tag.*service" shared/security/src/ --include="*.java"
```

---

## 5. MASTER 역할 — 마이그레이션 대상 전체 page_code VIEW+EDIT 보유 확인

SP-D5 AOP deny 분기는 `canView=false` 또는 `canEdit=false` 시 동작한다.
MASTER 역할은 모든 page_code 에 대해 `can_view=TRUE`, `can_edit=TRUE` 이어야 한다.

```sql
-- 마이그레이션 대상 page_code 에서 MASTER 권한 전체 확인
SELECT page_code, can_view, can_edit
FROM role_page_permissions
WHERE role_code = 'MASTER'
  AND is_deleted = FALSE
ORDER BY page_code;

-- 기대 결과: 모든 행 can_view=TRUE, can_edit=TRUE
-- 예외 확인 (can_view=FALSE 또는 can_edit=FALSE 인 MASTER row 0건):
SELECT COUNT(*) AS master_deny_count
FROM role_page_permissions
WHERE role_code = 'MASTER'
  AND is_deleted = FALSE
  AND (can_view = FALSE OR can_edit = FALSE);
-- 기대 결과: 0
```

---

## 6. AOP @RequirePermission ↔ PermissionGuard 전환 1:1 정합 확인

SP-D5 이전 각 서비스의 `*PermissionGuard.checkView/checkEdit` 호출이
`@RequirePermission` 으로 1:1 대체되어야 한다.
대체 누락 endpoint 0건 확인.

```sql
-- NOTE: 코드 레벨 검증 — SQL 직접 불가
-- 검증 방법: grep 기반
```

```bash
# SP-D5 이전 checkView/checkEdit 직접 호출 잔류 0건 확인
# (마이그레이션 대상 ~25 endpoint 에서)
grep -r "\.checkView\|\.checkEdit" services/ --include="*.java" \
  | grep -v "PermissionGuard.java" \
  | grep -v "IT.java" \
  | grep -v "Test.java"
# 기대 결과: 0건 (마이그레이션 완료 상태)
# 잔류 시: 미전환 endpoint 목록 → P0 결함

# @RequirePermission 신규 적용 count
grep -r "@RequirePermission" services/ --include="*.java" | wc -l
# 기대 결과: ~25건 (마이그레이션된 endpoint 수와 일치)
```

---

## 7. 기존 @PreAuthorize 미변경 보존 확인

SP-D5 는 마이그레이션 대상 ~25 endpoint 의 `@PreAuthorize` 를 제거하고
나머지 잔여 ~475 endpoint 의 `@PreAuthorize` 는 변경하지 않는다.

```bash
# SP-D5 PR diff 에서 @PreAuthorize 변경 라인 수 확인
git diff origin/main...HEAD services/ | grep "@PreAuthorize" | grep "^-" | wc -l
# 기대 결과: ~25 (마이그레이션 대상 endpoint 수)

git diff origin/main...HEAD services/ | grep "@PreAuthorize" | grep "^+" | wc -l
# 기대 결과: 0 (신규 @PreAuthorize 추가 없음)

# 최종 잔류 @PreAuthorize 총 count (services/ 전체)
grep -r "@PreAuthorize" services/ --include="*.java" | wc -l
# 기대 결과: (SP-D4 baseline) - 25 (마이그레이션된 수)
# SP-D4 baseline: 총 503건 (2026-05-19 기준 grep count)
# SP-D5 이후 기대: 약 478건 (± 마이그레이션 실제 수)
```

---

## 8. role_page_permissions Idempotency 확인 (seeder 2회 재실행)

SP-D5 신규 Flyway migration (V11 이후) 이 있다면 멱등성 확인.
기존 V7~V10 은 `ON CONFLICT DO NOTHING` 패턴으로 멱등성 보장됨.

```sql
-- seeder 재실행 전 count
SELECT COUNT(*) AS total_count
FROM role_page_permissions
WHERE is_deleted = FALSE;

-- Flyway repair + migrate 재실행 또는 V11 SQL 재실행 후
-- seeder 재실행 후 count 동일 여부 확인
SELECT COUNT(*) AS total_count_after
FROM role_page_permissions
WHERE is_deleted = FALSE;

-- 기대 결과: total_count == total_count_after
```

---

## 9. Counter 레이블 page 값 ↔ page_code 정합 확인

`permission_guard_denied_total` Counter 의 `page` 레이블 값이
`role_page_permissions.page_code` 와 일치해야 한다.

Prometheus 메트릭 레이블 형식:
```
permission_guard_denied_total{service="slip-service",page="estimates.list",role="DRIVER",action="VIEW"} 1.0
```

```sql
-- Counter page 레이블에 사용될 page_code 목록이 DB 에 존재하는지 확인
-- (수동 대조 — Prometheus 쿼리 결과와 DB SELECT 결과 비교)
SELECT DISTINCT page_code
FROM role_page_permissions
WHERE is_deleted = FALSE
  AND page_code IN (
      -- Prometheus 메트릭에서 확인된 page 레이블 값 목록
      'estimates.list',
      'dispatch.board',
      'admin.employees',
      'admin.users',
      'partners.list',
      'products.admin',
      'arologis.admin',
      'inventory.warehouses',
      'sales.partner-order.list',
      'purchases.slip.list',
      'sales.slip.list',
      'notification.dispatch-sms.send-audit'
  )
ORDER BY page_code;

-- 기대 결과: 모든 page 값이 DB 에 등록된 page_code 와 일치 (행 수 = IN 절 항목 수)
```

---

## 10. SP-D1~D4 누적 정합성 회귀 확인 (SP-D5 후 전체 page_code 완전성)

```sql
-- SP-D1~D4 누적 등록 page_code 총 개수 확인 (SP-D5 이후에도 동일해야 함)
SELECT COUNT(DISTINCT page_code) AS total_page_codes
FROM role_page_permissions
WHERE is_deleted = FALSE;

-- 기대 결과: SP-D4 기준 41개 이상
-- SP-D5 가 page_code 를 추가/삭제하지 않는다면 SP-D4 동일 수치

-- SP-D1~D4 핵심 page_code 존재 여부 (회귀 확인)
SELECT
    COUNT(CASE WHEN page_code = 'admin.permissions'                    THEN 1 END) AS sp_d1_admin_permissions,
    COUNT(CASE WHEN page_code = 'accounting.tax-invoice.list'          THEN 1 END) AS sp_d2_tax_invoice,
    COUNT(CASE WHEN page_code = 'dispatch.board'                       THEN 1 END) AS sp_d3_dispatch_board,
    COUNT(CASE WHEN page_code = 'estimates.list'                       THEN 1 END) AS sp_d4_estimates,
    COUNT(CASE WHEN page_code = 'arologis.admin'                       THEN 1 END) AS sp_d4_arologis_admin
FROM role_page_permissions
WHERE is_deleted = FALSE;

-- 기대 결과: 모든 컬럼 값 >= 2 (역할 종류 수)
```

---

## 검증 우선순위 요약

| 검증 항목 | 우선순위 | 방법 |
|----------|----------|------|
| @RequirePermission page ↔ DB page_code 1:1 일치 | P0 | SQL #1 + grep |
| action 값 VIEW/EDIT 두 종류만 | P0 | grep |
| service 태그 ↔ spring.application.name | P0 | 수동 대조 |
| MASTER 역할 전체 deny 0건 | P1 | SQL #5 |
| checkView/checkEdit 직접 호출 잔류 0건 | P1 | grep |
| @PreAuthorize 잔류 count 정합 | P1 | grep diff |
| Idempotency seeder 2회 재실행 | P2 | SQL #8 |
| Counter page 레이블 ↔ DB page_code | P2 | SQL #9 |
| SP-D1~D4 누적 page_code 총수 회귀 | P2 | SQL #10 |
