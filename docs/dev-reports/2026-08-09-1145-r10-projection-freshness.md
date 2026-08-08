# PR #1145 R10 — projection freshness CI gate

## 판정

`auth-service`의 Testcontainers PostgreSQL에 `classpath:db/migration` 전체를 적용한 뒤,
체크인된 desktop DB projection과 `role_page_permission_templates`를 7비트로 비교하는
실행 시 게이트를 추가했다. projection이 stale이면 CI가 RED가 된다.

현재 원복 상태에서 게이트는 V97 적용 결과와 체크인 projection의 다음 5셀을 실제로 잡아
RED가 된다. V97은 변경하지 않았다.

```text
MANAGER|accounting.tax-invoice.inbound.manage db=1111000 projection=0000000
MANAGER|accounting.sales-slip.accounting      db=1111000 projection=0000000
MANAGER|accounting.purchase-slip.accounting   db=1111000 projection=0000000
SALES|accounting.sales-slip.accounting        db=1000000 projection=0000000
SALES|accounting.purchase-slip.accounting     db=1000000 projection=0000000
```

이는 이번 게이트가 발견한 기존 stale 상태다. projection을 갱신해 GREEN으로 만들면 R9의
동결된 354셀 집합이 줄어들 수 있으므로, 요청에 따라 projection·mock·V97을 영구 변경하지
않았다. 임시 정합 mutation으로 GREEN 동작은 별도로 증명했다.

## 검사 위치와 이유

검사 파일:

- `services/auth-service/src/test/java/com/samhanair/logis/auth/it/AccountingPermissionProjectionFreshnessIT.java:25-43`
  - `@Testcontainers`의 PostgreSQL 16 컨테이너를 사용한다. CI가 이미 auth-service 쪽에서
    실 PostgreSQL과 Flyway를 쓰므로 프런트 CI에 DB를 추가하지 않는다.
- `.../AccountingPermissionProjectionFreshnessIT.java:47-56`
  - `classpath:db/migration` 전체를 Flyway로 적용한다. 새 migration이 권한을 바꾸면
    적용된 DB 결과가 즉시 비교 대상이 된다. 컨테이너 시작 실패는 테스트 실행 실패이며
    skip 경로가 없다.
- `.../AccountingPermissionProjectionFreshnessIT.java:62-70`
  - catalog와 projection 파일 존재를 명시적으로 단언한다. 파일 부재는 실패한다.
- `.../AccountingPermissionProjectionFreshnessIT.java:73-90`
  - `role_page_permission_templates`의 활성 행을 DB에서 read-only SELECT하고
    `view/create/update/delete/restore/download/print` 순서의 7비트로 정규화한다.
- `.../AccountingPermissionProjectionFreshnessIT.java:92-118`
  - `PERMISSION_ROLES × PERMISSION_PAGE_CODES`(11×122) 전체 곱을 `0000000`으로
    초기화한 뒤 DB 값과 projection 값을 비교한다. projection의 추가 키와 모든 셀의
    불일치를 함께 실패시켜 DB→projection, projection→DB 양방향을 보장한다.

이 위치가 적절한 이유는 권한 정본이 auth-service migration이고, 해당 Gradle test task가
CI의 auth-service 테스트 묶음에 이미 포함되어 있기 때문이다. desktop Vitest는 mock/R9
동결을 계속 검사하지만 DB freshness의 정본 역할을 하지 않는다.

## 3종 mutation 증명

모든 mutation은 테스트 전 원문을 apply하고 targeted Gradle 테스트를 실행한 뒤 즉시 원복했다.
임시 migration은 삭제 확인했다.

### 1. 새 migration으로 권한 1비트 추가 — RED

임시 원문:

```sql
-- TEMP R10 mutation: add one permission bit without updating the projection.
UPDATE role_page_permission_templates
   SET can_print = NOT can_print,
       modified_at = NOW(),
       modified_by = 'r10-temporary-mutation'
 WHERE role_code = 'MANAGER'
   AND page_code = 'accounting.sales-slip.list'
   AND is_deleted = FALSE;
```

결과 원문:

```text
MANAGER|accounting.sales-slip.list db=1111001 projection=1111000
... plus the pre-existing V97 5-cell mismatch
BUILD FAILED; 1 test completed, 1 failed
```

복구 증명:

```text
Test-Path services/auth-service/src/main/resources/db/migration/V98__r10_projection_freshness_mutation.sql
False
git status --short
?? services/auth-service/src/test/java/com/samhanair/logis/auth/it/AccountingPermissionProjectionFreshnessIT.java
```

### 2. projection 1비트 임의 변경 — RED

임시 원문:

```diff
-    'partners.delete': '1111100',
+    'partners.delete': '1111101',
```

결과 원문:

```text
MASTER|partners.delete db=1111100 projection=1111101
... plus the pre-existing V97 5-cell mismatch
BUILD FAILED; 1 test completed, 1 failed
```

복구 후 projection 파일의 `git diff`는 비어 있고, `git status --short`에는 새 IT 파일만 남았다.

### 3. 정합 상태 — GREEN

임시로 projection에 V97 적용 결과 5셀을 추가했다.

```text
MANAGER accounting.tax-invoice.inbound.manage = 1111000
MANAGER accounting.sales-slip.accounting      = 1111000
MANAGER accounting.purchase-slip.accounting   = 1111000
SALES   accounting.sales-slip.accounting      = 1000000
SALES   accounting.purchase-slip.accounting   = 1000000
```

결과:

```text
BUILD SUCCESSFUL in 24s
1 test completed, 0 failed
```

이 5셀은 증명 직후 원복했다. 따라서 체크인 결과물에는 projection refresh나 mock bit
변경이 남지 않았다.

## DB·파일 부재 동작

- Docker/DB 부재: `@Container` PostgreSQL 시작이 실패해 테스트 자체가 실패한다. 기존
  체크인 projection으로 대체하거나 skip하지 않는다.
- catalog 파일 부재: `Files.exists(CATALOG)` 단언이 실패한다.
- projection 파일 부재: `Files.exists(PROJECTION)` 단언이 실패한다.
- DB active template 결과가 비어 있음: `isNotEmpty()` 단언이 실패한다.

## 검증 실행

| 명령 | 결과 | 시간 |
|---|---|---:|
| `clients/desktop` 지정 Vitest | 1 file / 8 tests passed | 3.8s |
| targeted `AccountingPermissionProjectionFreshnessIT` (정합 임시 mutation) | GREEN, 1 test passed | 24.7s |
| targeted `AccountingPermissionProjectionFreshnessIT` (최종 원복 상태) | RED, V97 5셀 stale 검출 | 61.2s |

요청대로 auth-service 전체 스위트는 실행하지 않았다. 전체 스위트는 타임아웃 위험이
있으며, CI에서는 `:services:auth-service:test` 묶음에 이 IT가 포함된다.

## 신규 파일

- `services/auth-service/src/test/java/com/samhanair/logis/auth/it/AccountingPermissionProjectionFreshnessIT.java`
- `docs/dev-reports/2026-08-09-1145-r10-projection-freshness.md`

현재 `git status --short`에는 위 두 신규 파일만 표시되어야 하며, V97 변경은 없다.
