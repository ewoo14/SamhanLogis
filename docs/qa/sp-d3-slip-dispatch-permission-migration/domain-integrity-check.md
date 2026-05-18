# SP-D3 도메인 정합성 검증 — SQL

> 작성일: 2026-05-18
> 담당: QA Agent
> 관련 DB: auth-service DB (page_permission 테이블)
> 관련 서비스: slip-service, notification-service, arologis-service (dispatch.board)

---

## 1. SP-D3 6 PageCode 데이터 존재 확인

SP-D1 Flyway V7 seeder 가 삽입한 매입/매출/배차 기본 권한 데이터 검증.
SP-D3 마이그레이션 후에도 6개 pageCode 에 대한 권한 행이 page_permission 테이블에 존재해야 한다.

```sql
-- SP-D3 대상 6개 PageCode 존재 확인
SELECT page_code, COUNT(*) AS role_count
FROM page_permission
WHERE page_code IN (
    'sales.slip.list',
    'purchases.slip.list',
    'purchases.receipt-ocr',
    'dispatch.board',
    'notification.dispatch-sms.send-audit',
    'inbound.inspection'
)
  AND deleted_at IS NULL
GROUP BY page_code
ORDER BY page_code;

-- 기대 결과: 6행, 각 role_count >= 2 (MASTER + 해당 역할 최소 1개)
```

---

## 2. 역할별 기본 권한 정합성 확인

### 2-1. SALES 역할 — sales.slip.list view=true

```sql
SELECT role_code, page_code, can_view, can_edit
FROM page_permission
WHERE role_code = 'SALES'
  AND page_code = 'sales.slip.list'
  AND deleted_at IS NULL;

-- 기대 결과:
-- SALES | sales.slip.list | true | true
```

### 2-2. WAREHOUSE 역할 — 3개 PageCode view=true (V9 fix 반영)

```sql
SELECT role_code, page_code, can_view, can_edit
FROM role_page_permissions
WHERE role_code = 'WAREHOUSE'
  AND page_code IN ('purchases.slip.list', 'purchases.receipt-ocr', 'inbound.inspection')
  AND is_deleted = FALSE
ORDER BY page_code;

-- 기대 결과 (V9 fix 적용 후):
-- WAREHOUSE | inbound.inspection     | true | true
-- WAREHOUSE | purchases.receipt-ocr  | true | true   ← V9 fix: FALSE→TRUE
-- WAREHOUSE | purchases.slip.list    | true | false
-- NOTE: sales.slip.list 는 V9 fix 로 canView=FALSE 처리됨 (매출 슬립 숨김)
```

### 2-3. DISPATCH 역할 — 2개 PageCode view=true

```sql
SELECT role_code, page_code, can_view, can_edit
FROM page_permission
WHERE role_code = 'DISPATCH'
  AND page_code IN ('dispatch.board', 'notification.dispatch-sms.send-audit')
  AND deleted_at IS NULL
ORDER BY page_code;

-- 기대 결과:
-- DISPATCH | dispatch.board                       | true | false
-- DISPATCH | notification.dispatch-sms.send-audit | true | false
```

---

## 3. SALES 역할 — 매입/배차 권한 없음 확인

SALES 는 기본적으로 purchases.slip.list, dispatch.board, inbound.inspection 권한이 없어야 한다.
V9 fix migration 적용 후 SALES dispatch.board canView = FALSE 로 보정됨.

```sql
SELECT COUNT(*) AS unexpected_permission_count
FROM role_page_permissions
WHERE role_code = 'SALES'
  AND page_code IN ('purchases.slip.list', 'dispatch.board', 'inbound.inspection')
  AND is_deleted = FALSE
  AND can_view = true;

-- 기대 결과: 0 (SALES 는 매입/배차 기본 권한 없음 — V9 seed fix 적용 후)
-- V7 에서 SALES dispatch.board canView=TRUE 였으나 V9 에서 FALSE 로 보정됨.
```

---

## 4. DISPATCH 역할 — 매입/매출 슬립 권한 없음 확인

```sql
SELECT COUNT(*) AS unexpected_permission_count
FROM page_permission
WHERE role_code = 'DISPATCH'
  AND page_code IN ('sales.slip.list', 'purchases.slip.list')
  AND deleted_at IS NULL
  AND can_view = true;

-- 기대 결과: 0 (DISPATCH 는 슬립 기본 권한 없음)
```

---

## 5. 권한 revoke 후 soft-delete 정합성

마스터가 SALES 의 purchases.slip.list 권한 revoke 시
soft-delete 패턴 적용 여부 확인 (BaseEntity soft delete).

```sql
-- revoke 후 soft-delete 레코드 확인
SELECT role_code, page_code, can_view, deleted_at
FROM page_permission
WHERE role_code = 'SALES'
  AND page_code = 'purchases.slip.list'
ORDER BY created_at DESC
LIMIT 5;

-- 기대 결과 (revoke 전 명시적 grant 했다면):
-- can_view=false 또는 deleted_at IS NOT NULL (soft delete)
-- revoke 전 레코드: deleted_at IS NULL + can_view=true
-- revoke 후 레코드: deleted_at IS NOT NULL (또는 can_view=false)
```

---

## 6. Idempotency 검증 — seeder 2회 재실행 후 row count 동일

SP-D3 관련 seeder 를 2회 실행해도 page_permission row count 가 동일한지 확인.

```sql
-- seeder 실행 전 count
SELECT COUNT(*) AS total_count
FROM page_permission
WHERE deleted_at IS NULL;

-- seeder 재실행 (Flyway repair + migrate 또는 수동 seed SQL 재실행)
-- seeder 실행 후 count 동일 여부 확인
SELECT COUNT(*) AS total_count_after
FROM page_permission
WHERE deleted_at IS NULL;

-- 기대 결과: total_count == total_count_after (idempotency 보장)
```

---

## 7. MASTER 역할 SP-D3 PageCode 전체 권한 보유 확인

```sql
SELECT role_code, page_code, can_view, can_edit
FROM page_permission
WHERE role_code = 'MASTER'
  AND page_code IN (
      'sales.slip.list',
      'purchases.slip.list',
      'purchases.receipt-ocr',
      'dispatch.board',
      'notification.dispatch-sms.send-audit',
      'inbound.inspection'
  )
  AND deleted_at IS NULL
ORDER BY page_code;

-- 기대 결과: 6행 모두 can_view=true, can_edit=true
```

---

## 8. SP-D1~D3 누적 PageCode 완전성 확인 (19개)

SP-D1 12개 + SP-D2 회계 7개 = 총 19개 PageCode 가 DB 에 등록되어야 한다.
SP-D3 는 SP-D1 PageCode 를 재활용하므로 추가 PageCode 없음.

```sql
-- 전체 등록된 pageCode 목록
SELECT DISTINCT page_code
FROM page_permission
WHERE deleted_at IS NULL
ORDER BY page_code;

-- 기대 결과 (SP-D1 12개 + SP-D2 회계 7개 = 19개):
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
-- admin.permissions
-- dispatch.board
-- inbound.inspection
-- notification.dispatch-sms.send-audit
-- purchases.receipt-ocr
-- purchases.slip.list
-- sales.slip.list
```

---

## 9. SP-D3 3-service 패턴 일관성 — @MockBean DynamicPermissionClient stub 검증

slip-service, notification-service, arologis-service 각 IT 에서
`@MockBean DynamicPermissionClient` + `@BeforeEach lenient stub` 패턴 적용 여부 확인.

```sql
-- auth-service: DynamicPermission endpoint 응답 확인 (GET /auth/admin/permissions/my)
-- stub canView=true 시 각 서비스 endpoint 200 OK 반환 여부 IT 검증
-- stub canView=false 시 403 또는 서비스별 허용 상태 코드 반환 여부 IT 검증

-- NOTE: SQL 직접 검증 불가 — @MockBean stub 결과는 IT 로그 확인
-- slip-service: SlipRepository 조회 결과 검증
-- notification-service: AlgoSendAuditRepository 조회 결과 검증
-- arologis-service: DispatchBoardRepository 조회 결과 검증
```

---

## 10. SP-D2 CI fix 트랩 회귀 방지 — lenient stub 자동 적용 확인

SP-D2 P04 트랩: `@MockBean DynamicPermissionClient` 누락 시 Eureka 비활성 → 500 발생.
SP-D3 는 동일 트랩이 slip-service IT, notification-service IT, arologis-service IT 에서 발생 가능.

```sql
-- slip-service IT 기존 @MockBean 존재 확인 (파일 수준 확인)
-- services/slip-service/src/test/java/com/samhanair/logis/slip/it/*.java
-- @MockBean DynamicPermissionClient 또는 유사 외부 client mock 존재 여부

-- notification-service IT 확인
-- services/notification-service/src/test/java/.../*.java

-- arologis-service IT 확인
-- services/arologis-service/src/test/java/.../*.java
```

**SQL 외 검증 방법**:
1. `grep -r "@MockBean" services/slip-service/src/test/` → DynamicPermissionClient 또는 유사 client mock 존재 확인
2. `grep -r "@MockBean" services/notification-service/src/test/` → 동일 확인
3. IT 실행 시 `@BeforeEach lenient()` 설정 여부 로그 확인
