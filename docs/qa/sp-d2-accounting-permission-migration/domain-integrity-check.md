# SP-D2 도메인 정합성 검증 — SQL

> 작성일: 2026-05-18
> 담당: QA Agent
> 관련 DB: auth-service DB (page_permission 테이블)

---

## 1. page_permission 기본 데이터 정합성

SP-D1 Flyway V7 seeder 가 삽입한 기본 권한 데이터 검증.
SP-D2 마이그레이션 후에도 회계 12 pageCode 에 대한 기본 권한이 정상 존재하는지 확인.

```sql
-- 회계 pageCode 5종 모두 존재 확인
SELECT page_code, COUNT(*) as role_count
FROM page_permission
WHERE page_code IN (
    'accounting.tax-invoice.emit-nts',
    'accounting.tax-invoice.list',
    'accounting.deposit-match',
    'accounting.daily-closing',
    'accounting.general-ledger'
)
AND deleted_at IS NULL
GROUP BY page_code
ORDER BY page_code;

-- 기대 결과: 5행, 각 role_count >= 3 (ACCOUNTANT/MANAGER/MASTER)
```

---

## 2. ACCOUNTANT 역할 회계 기본 권한 확인

```sql
-- ACCOUNTANT 역할의 회계 pageCode 권한 조회
SELECT role_code, page_code, can_view, can_edit
FROM page_permission
WHERE role_code = 'ACCOUNTANT'
  AND page_code LIKE 'accounting.%'
  AND deleted_at IS NULL
ORDER BY page_code;

-- 기대 결과:
-- accounting.daily-closing   | true | true
-- accounting.deposit-match   | true | false
-- accounting.general-ledger  | true | false
-- accounting.tax-invoice.emit-nts | true | true
-- accounting.tax-invoice.list | true | true
```

---

## 3. SALES 역할 회계 권한 없음 확인

```sql
-- SALES 역할의 회계 pageCode 권한 없음 확인 (기본 seed 상태)
SELECT COUNT(*) as accounting_permission_count
FROM page_permission
WHERE role_code = 'SALES'
  AND page_code LIKE 'accounting.%'
  AND deleted_at IS NULL
  AND can_view = true;

-- 기대 결과: 0 (SALES 는 회계 권한 없음)
```

---

## 4. 권한 revoke 후 soft-delete 정합성

마스터가 ACCOUNTANT 의 accounting.tax-invoice.list 권한 revoke 시
soft-delete 패턴 적용 여부 확인 (BaseEntity soft delete).

```sql
-- revoke 후 soft-delete 레코드 확인
SELECT role_code, page_code, can_view, deleted_at
FROM page_permission
WHERE role_code = 'ACCOUNTANT'
  AND page_code = 'accounting.tax-invoice.list'
ORDER BY created_at DESC
LIMIT 5;

-- 기대 결과:
-- can_view=false 또는 deleted_at IS NOT NULL (soft delete)
-- revoke 전 레코드: deleted_at IS NULL + can_view=true
-- revoke 후 레코드: deleted_at IS NOT NULL (또는 can_view=false)
```

---

## 5. Idempotency 검증 — seeder 2회 재실행 후 row count 동일

SP-D1 V7 seeder 를 2회 실행해도 page_permission row count 가 동일한지 확인
(ON CONFLICT DO NOTHING 또는 UPSERT 패턴 보장).

```sql
-- seeder 실행 전 count
SELECT COUNT(*) as total_count FROM page_permission WHERE deleted_at IS NULL;

-- seeder 재실행 (flyway repair + migrate 또는 수동 seed SQL 재실행)
-- seeder 실행 후 count 동일 여부 확인
SELECT COUNT(*) as total_count_after FROM page_permission WHERE deleted_at IS NULL;

-- 기대 결과: total_count == total_count_after (idempotency 보장)
```

---

## 6. MASTER 역할 전체 권한 보유 확인

MASTER 는 모든 pageCode 에 대해 can_view=true, can_edit=true 여야 한다.

```sql
-- MASTER 역할 회계 권한 전체 확인
SELECT role_code, page_code, can_view, can_edit
FROM page_permission
WHERE role_code = 'MASTER'
  AND deleted_at IS NULL
ORDER BY page_code;

-- 기대 결과: 모든 row can_view=true, can_edit=true
-- 회계 pageCode 5종 모두 존재
```

---

## 7. SP-D2 마이그레이션 후 PageCode 목록 완전성 확인

DB 에 등록된 PageCode 가 FE `permissionsApi.ts` 의 `PageCode` 타입과 일치하는지 확인.

```sql
-- 전체 등록된 pageCode 목록
SELECT DISTINCT page_code
FROM page_permission
WHERE deleted_at IS NULL
ORDER BY page_code;

-- 기대 결과 (SP-D1 seeder 기준 12개):
-- accounting.daily-closing
-- accounting.deposit-match
-- accounting.general-ledger
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
