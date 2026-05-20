# Ecount MIG-10 — Order Employee cross-link + aging snapshot net

> 작성일: 2026-05-20
> 범위: D-MIG-8-05 + C6-MIN-3 이연 처리

## 요약

MIG-10은 MIG-8에서 snapshot으로만 남긴 `orders.manager_name`을 user-service Employee와 연결하고, MIG-9 `partner_aging_snapshot` MATERIALIZED VIEW에 순잔액 컬럼을 추가한다.

## 변경 사항

| 영역 | 변경 |
|---|---|
| accounting Flyway | V30 `orders.manager_employee_id` UUID + active index, `partner_aging_snapshot` DROP + RECREATE |
| auth Flyway | V23 `ecount.mig10.order-employee-backfill` PageCode seed |
| shared/common | `EcountMig10Result`, MIG10 ErrorCode 4종 |
| accounting-service | `Mig10OrderEmployeeBackfillService`, `EmployeeLookupClient`, controller 1종 |
| user-service | `/internal/users/by-name?name=` exact lookup endpoint |

## 운영 계약

- `POST /admin/accounting/orders/backfill-employee-cross-link`
- 권한: `ROLE_MASTER`, `ROLE_MANAGER`
- 동적 PageCode: `ecount.mig10.order-employee-backfill`
- 대상 row: `manager_name IS NOT NULL AND manager_employee_id IS NULL AND is_deleted = FALSE`
- Employee lookup: user-service `Employee.fullName` exact match
- 매칭 1건: `orders.manager_employee_id` 업데이트
- 매칭 0건: `MIG10_EMPLOYEE_LOOKUP_MISS` warning, NULL 유지
- 매칭 2건 이상: `MIG10_EMPLOYEE_AMBIGUOUS` warning, NULL 유지

## DB 경계 결정

`employees` 테이블은 user-service DB 소유다. 따라서 accounting V30은 `manager_employee_id` UUID 컬럼과 index를 항상 추가하되, 동일 schema에 `employees`가 존재하는 배포에서만 `orders_manager_employee_fk`를 조건부 생성한다. 런타임 lookup은 accounting-service가 user-service internal endpoint를 호출한다.

## aging snapshot net 컬럼

기존 increase-only 컬럼은 유지한다.

| 신규 컬럼 | 계산 |
|---|---|
| `net_receivable` | `외상매출금`: debit - credit |
| `net_payable` | `외상매입금`: credit - debit |
| `net_cash` | `보통예금`/`현금`: debit - credit |

`REFRESH MATERIALIZED VIEW CONCURRENTLY partner_aging_snapshot`를 유지하기 위해 `partner_id` unique index를 재생성한다.

## 테스트

- `ErrorCodeMig10Test`: MIG10 ErrorCode 4종 HTTP 422 정합
- `PageCodeTest`: MIG10 PageCode enum/V23 seed 문자열 정합
- `Mig10OrderEmployeeBackfillServiceTest`: 8 behavior cases
- `EcountMig10OrderEmployeeBackfillControllerIT`: 5 case × 1 endpoint

검증:

```powershell
& "$env:USERPROFILE\.gradle\wrapper\dists\gradle-8.10.2-bin\a04bxjujx95o3nb99gddekhwo\gradle-8.10.2\bin\gradle.bat" --init-script .gradle\codex-plugin-resolution.init.gradle :shared:common:test :services:auth-service:test :services:accounting-service:test --offline --no-daemon
& "$env:USERPROFILE\.gradle\wrapper\dists\gradle-8.10.2-bin\a04bxjujx95o3nb99gddekhwo\gradle-8.10.2\bin\gradle.bat" --init-script .gradle\codex-plugin-resolution.init.gradle :services:user-service:test --offline --no-daemon
```
