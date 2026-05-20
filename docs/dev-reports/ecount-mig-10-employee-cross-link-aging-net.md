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
| shared/common | `EcountMig10Result`, MIG10 ErrorCode 5종 |
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
- user-service 호출 실패/5xx: `MIG10_EMPLOYEE_LOOKUP_ERROR`

## DB 경계 결정

`employees` 테이블은 user-service DB 소유다. 따라서 accounting V30은 `manager_employee_id` UUID 컬럼과 index만 추가하고 FK를 선언하지 않는다. 참조 무결성은 accounting-service가 user-service internal endpoint를 호출하는 application-level `EmployeeLookupClient` 검증으로 보장한다.

## aging snapshot net 컬럼

기존 increase-only 컬럼은 유지한다.

| 신규 컬럼 | 계산 |
|---|---|
| `net_receivable` | `account_code IN ('110')`: debit - credit |
| `net_payable` | `account_code IN ('201')`: credit - debit |
| `net_cash` | `account_code IN ('101', '102')`: debit - credit |

`REFRESH MATERIALIZED VIEW CONCURRENTLY partner_aging_snapshot`를 유지하기 위해 `partner_id` unique index를 재생성한다.

## 테스트

- `ErrorCodeMig10Test`: MIG10 ErrorCode 5종 HTTP 422 정합
- `PageCodeTest`: MIG10 PageCode enum/V23 seed 문자열 정합
- `Mig10OrderEmployeeBackfillServiceTest`: 8 behavior cases
- `EcountMig10OrderEmployeeBackfillControllerIT`: 5 case × 1 endpoint
- `InternalUserByNameControllerIT`: `/internal/users/by-name` 6 case
- `EmployeeLookupClientTest`: 200 empty와 5xx `MIG10_EMPLOYEE_LOOKUP_ERROR` 분리
- `OrderMig10Test`: `linkManagerEmployee(UUID)` mutator

Controller IT는 MIG-7~9와 동일하게 권한·바디·도메인 오류 매핑만 검증한다. `EmployeeLookupClient` 실 호출 및 네트워크 실패 분기는 service/client unit test에서 검증한다.

검증:

```powershell
& "$env:USERPROFILE\.gradle\wrapper\dists\gradle-8.10.2-bin\a04bxjujx95o3nb99gddekhwo\gradle-8.10.2\bin\gradle.bat" --init-script .gradle\codex-plugin-resolution.init.gradle :shared:common:test :services:auth-service:test :services:user-service:test :services:accounting-service:test --offline --no-daemon
```
