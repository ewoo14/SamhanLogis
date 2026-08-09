# PR #1130 (#1064) — MANAGER 입고 검수 완료 권한 부여

## 결정과 범위

개발책임자 결정(2026-08-09)은 **MANAGER가 입고 검수 완료를 할 수 있어야 한다**는 것이다. 정찰 문서 `docs/dev-reports/2026-08-09-1064-lifecycle-recon.md`가 확인한 원 결함은 현재 HEAD에서 재현되지 않았고, 도메인↔화면 액션 차집합은 입고·출고 모두 0이었다. 남은 차이는 MANAGER의 `inbound.inspection:UPDATE=false`뿐이었다.

검수 완료는 `INSPECTING → COMPLETED`이며, 화면 계약과 서버 구현 모두 `slip.transfer.process:UPDATE`와 `inbound.inspection:UPDATE`를 요구한다. MANAGER는 전자를 이미 보유하므로 이번 슬라이스에서는 후자만 추가했다. 다른 lifecycle 액션, 다른 페이지 코드, 다른 역할은 범위 밖이다.

## migration 번호 결정

`V97`은 선행 PR #1145의 `origin/feat/1144-accounting-slip-spec`가 점유하고 있다. 원격 브랜치 전체를 `git ls-tree`로 확인한 원문은 다음과 같다(97 이상만 필터링).

```text
refs/remotes/origin/feat/1144-accounting-slip-spec services/auth-service/src/main/resources/db/migration/V97__align_accounting_slip_permissions.sql
```

따라서 `V98`을 사용했다. `origin/main` 및 열린 원격 브랜치에서 `V98`은 확인되지 않았다.

신규 파일:

- `services/auth-service/src/main/resources/db/migration/V98__grant_manager_inbound_inspection_update.sql`
- `docs/dev-reports/2026-08-09-1064-grant-manager-inspection.md`

## (a) `inbound.inspection` 액션 전수

canonical `role_page_permission_templates`의 7-action 모델을 기준으로 정리했다. `V39` 이후 실제 enforcement는 `account_page_permissions`이고, 역할/그룹 템플릿은 그 원천이다.

| 역할 | VIEW | CREATE | UPDATE | DELETE | RESTORE | DOWNLOAD | PRINT |
|---|---:|---:|---:|---:|---:|---:|---:|
| MASTER | 허용 | 허용 | 허용 | 허용 | 거부 | 거부 | 거부 |
| MANAGER (부여 전) | 허용 | 거부 | 거부 | 거부 | 거부 | 거부 | 거부 |
| MANAGER (V98 후) | 허용 | 거부 | **허용** | 거부 | 거부 | 거부 | 거부 |
| ACCOUNTANT | 거부 | 거부 | 거부 | 거부 | 거부 | 거부 | 거부 |
| SALES | 거부 | 거부 | 거부 | 거부 | 거부 | 거부 | 거부 |
| WAREHOUSE | 허용 | 허용 | 허용 | 허용 | 거부 | 거부 | 거부 |
| INVENTORY | 허용 | 허용 | 허용 | 허용 | 거부 | 거부 | 거부 |
| DISPATCH | 거부 | 거부 | 거부 | 거부 | 거부 | 거부 | 거부 |
| DRIVER | 거부 | 거부 | 거부 | 거부 | 거부 | 거부 | 거부 |
| STAFF | 거부 | 거부 | 거부 | 거부 | 거부 | 거부 | 거부 |
| DEVELOPER | 거부 | 거부 | 거부 | 거부 | 거부 | 거부 | 거부 |
| PARTNER | 거부 | 거부 | 거부 | 거부 | 거부 | 거부 | 거부 |

따라서 V98이 여는 비트는 MANAGER의 `UPDATE` 하나다. 기존 MASTER·WAREHOUSE·INVENTORY의 비트는 migration에서 읽거나 덮어쓰지 않는다.

## (b) 검수 완료가 검사하는 권한

- 화면 권한 요구 표: [`SlipDetailPage.tsx:1246-1275`](../../clients/desktop/src/renderer/routes/SlipDetailPage.tsx) — INBOUND `inspect`는 `slip.transfer.process:UPDATE`와 `inbound.inspection:UPDATE`를 모두 요구한다.
- 화면 버튼 실행/disabled 공통 경계: [`SlipDetailPage.tsx:2599-2611`](../../clients/desktop/src/renderer/routes/SlipDetailPage.tsx), [`SlipDetailPage.tsx:4935-4951`](../../clients/desktop/src/renderer/routes/SlipDetailPage.tsx).
- 서버 검수 endpoint: [`SlipController.java:514-539`](../../services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipController.java) — `slip.transfer.process:UPDATE` 검사 후 INBOUND이면 `inbound.inspection:UPDATE`를 검사한다.

추가 권한이 필요한지에 대한 판정은 **예, 두 번째 권한이 이미 필요하다**이다. 그러나 `slip.transfer.process:UPDATE`는 MANAGER가 이미 보유하므로 이번 PR에서 추가로 열지 않았다. OUTBOUND 결재선 capability 분기는 서버 코드상 outbound 후속 경로이며 INBOUND의 부족 권한을 대체하지 않는다.

## migration 설계와 불변식

`V98`은 다음 canonical 경로만 대상으로 한다.

1. MANAGER 역할 템플릿의 `inbound.inspection.can_update`만 `FALSE → TRUE`.
2. MANAGER 기본 그룹(`...0101`)의 같은 페이지 `can_update`만 `FALSE → TRUE`.
3. 활성 MANAGER 그룹 소속 계정의 `account_page_permissions`에서 `can_update`만 `FALSE → TRUE`.
4. 해당 계정 캐시 행이 없는 경우에만, 이미 갱신된 MANAGER 템플릿의 7-action 비트를 새 캐시 행으로 materialize한다.

기존 행의 `can_view`, `can_create`, `can_delete`, `can_restore`, `can_download`, `can_print`는 UPDATE 문에서 SET하지 않는다. `WHERE ... can_update = FALSE`와 `NOT EXISTS` 때문에 재실행 시 추가 변화가 없다. deprecated `role_page_permissions`는 V39 이후 enforcement 경로가 아니며, `can_edit` 하나로 7-action의 UPDATE-only 계약을 표현할 수 없으므로 변경하지 않았다.

## 실 `auth_db` 부여 전후 대조

실 DB에는 INSERT/UPDATE/DELETE를 실행하지 않았다. 공유 `auth_db`의 현재 값은 V98 부여 전 상태이며, 아래 “후”는 동일 SELECT 안에서 V98의 명시적 MANAGER-only 규칙을 적용한 **읽기 전용 projected after**다. 실제 DB의 Flyway 상태도 `V98=0`이다.

조회 원문:

```text
BEGIN
flyway|96|0
role_before_after|ACCOUNTANT|f|f|f|f
role_before_after|DEVELOPER|f|f|f|f
role_before_after|DISPATCH|f|f|f|f
role_before_after|DRIVER|f|f|f|f
role_before_after|INVENTORY|t|t|t|t
role_before_after|MANAGER|f|t|f|f
role_before_after|MASTER|t|t|t|t
role_before_after|PARTNER|f|f|f|f
role_before_after|SALES|f|f|f|f
role_before_after|STAFF|f|f|f|f
role_before_after|WAREHOUSE|t|t|t|t
idempotence|0
non_manager_unchanged|0
ROLLBACK
```

열 순서는 `role_code | before_update | after_update | before_delete | after_delete`다. MANAGER만 `UPDATE f→t`이고 모든 역할의 DELETE는 그대로다. MASTER·WAREHOUSE·INVENTORY의 기존 UPDATE도 그대로 `t`다.

실 계정/그룹의 부여 전 집계도 SELECT-only로 확인했다.

```text
account_group|개발자|2|0|0|0|0|0|0|0
account_group|기사|2|0|0|0|0|0|0|0
account_group|매니저|3|3|0|0|0|0|0|0
account_group|배차담당자|1|0|0|0|0|0|0|0
account_group|사원|2|0|0|0|0|0|0|0
account_group|영업원|10|0|0|0|0|0|0|0
account_group|재고원|1|1|1|1|1|0|0|0
account_group|창고원|1|1|1|1|1|0|0|0
account_group|회계원|7|0|0|0|0|0|0|0
```

열 순서는 `그룹 | 활성 계정 수 | VIEW | CREATE | UPDATE | DELETE | RESTORE | DOWNLOAD | PRINT`다. V98 후 projected manager 그룹은 `3|3|3|3|0|0|0`이 되며, 다른 그룹 행은 변하지 않는다.

## RED-A / RED-B 동시 계약

RED-A는 MANAGER의 INBOUND `inspect`가 두 권한을 모두 가질 때 활성화되는지, RED-B는 SALES·ACCOUNTANT 등 권한 없는 역할이 계속 차단되는지를 같은 계약 스펙에서 검증한다. mock 계정/그룹/`/permissions/my` 응답도 동일한 V98 model을 사용한다.

실행 원문:

```text
npx vitest run src/renderer/api/mock.test.ts src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts

✓ src/renderer/api/mock.test.ts (138 tests)
✓ src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts (23 tests)

Test Files  2 passed (2)
Tests       161 passed (161)
```

auth-service의 Flyway/권한 전체 검증 원문:

```text
./gradlew :services:auth-service:test --rerun-tasks

BUILD SUCCESSFUL in 1m 28s
12 actionable tasks: 12 executed
```

첫 실행에서 `accounts.role`을 참조한 V98이 V46의 `DROP COLUMN role`과 충돌해 387건 중 174건이 context 초기화로 실패했다. 이를 MANAGER 기본 그룹과 `account_groups` 기준으로 수정한 뒤 위 전체 테스트가 성공했다.

## 멱등성

- 역할/그룹/기존 계정 행은 `can_update = FALSE`일 때만 갱신한다.
- 캐시 신규 materialize는 `NOT EXISTS`일 때만 수행한다.
- 동일 규칙을 두 번 projection한 차이는 원문상 `idempotence|0`이다.
- 공유 `auth_db`에는 migration을 적용하지 않았고, Docker 재배포도 하지 않았다.

## 변경 파일

- `services/auth-service/src/main/resources/db/migration/V98__grant_manager_inbound_inspection_update.sql`
- `clients/desktop/src/renderer/api/mock.ts`
- `clients/desktop/src/renderer/api/mock.test.ts`
- `clients/desktop/src/renderer/routes/SlipDetailPage.lifecycle-contract.test.ts`
- `docs/dev-reports/2026-08-09-1064-grant-manager-inspection.md`
