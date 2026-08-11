# D-G1 S4a CODEX SOL 5.6 재검토 3

- 검토일: 2026-08-11 KST
- 대상: PR #1170, 사용자 지정 HEAD `0f48d91e5`
- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\wdg1s4`
- 역할: CODEX SOL 5.6 코드 검토자
- 판정: **MERGE BLOCKED — 차단 결함 1건**
- 제약 준수: git 명령 및 git 조작 0건, 공유 DB write 0건

## 1. 결론

`SalesCommissionSettlementPermissionSeedTest.bitsMap()`의 이번 `seenRoles` 수정 자체는 유효하다. 정상 V101은 GREEN이고, 초과·누락·중복·중복+초과 네 뮤테이션은 모두 실제 RED였다. 이 검사기의 이전 0 초기값 false-green은 닫혔다.

그러나 PM이 요구한 동형 전수에서 **다른 exact 검사기가 같은 종류의 중복을 합치는 false-green**을 재현했다.

1. `permission-contract-checker.ts`는 bit bucket의 raw page 행을 `Set`으로 합친 뒤 catalog를 비교한다. 같은 `(role,page)`가 두 bucket에 동시에 있어도 중복을 잃는다.
2. `accounting-slip-permission-db-snapshot.ts`는 객체 key 중복을 허용한다. 앞 행은 뒤 행에 덮이고 Vitest/Vite 경고만 남은 채 계약 검사가 GREEN이다.
3. `AccountingPermissionProjectionFreshnessIT.parseProjection()`도 동일 `(role,page)`를 `Map.put()`으로 덮고 중복을 감지하지 않는다.

따라서 “DB 정본 ↔ 생성 projection ↔ mock 계약이 exact”라는 감시가 아직 중복 좌표를 보존하지 못한다. 런타임 DB에는 active unique index가 있어 현재 DB 중복은 차단되지만, **정본 projection 또는 두 비교 원천이 함께 오염되면 gate가 GREEN**이므로 PR merge gate 결함이다.

## 2. 이번 수정 코드 확인

대상:

- `services/auth-service/src/test/java/com/samhanair/logis/auth/domain/SalesCommissionSettlementPermissionSeedTest.java`
- `services/auth-service/src/main/resources/db/migration/V101__seed_sales_commission_settlement_page_permission.sql`

`bitsMap()`은 11개 역할을 먼저 `0000000`으로 만들고, migration row를 읽을 때 `seenRoles.add(row.role())`를 단정한 후 bits를 넣는다. 따라서 다음을 분리해 감시한다.

- 역할 누락: 초기 0과 기대값 비교로 RED
- 역할 초과: actual map exact 비교로 RED
- 역할 중복: `seenRoles`로 값·순서와 무관하게 RED

원복 기준 SHA-256:

```text
V101 migration
B173883CED1D2A54A0FE378285DA460D03011EDA110E409D42DCC7D2D1C12327

SalesCommissionSettlementPermissionSeedTest.java
E1672A25BD89276DB11A60FDF6A39758465C94AED616AD56AB5FCCEED1D2F5B4
```

모든 뮤테이션 종료 후 위 두 hash로 복귀했다.

## 3. 직접 실행한 뮤테이션 4종

공통 명령:

```powershell
.\gradlew.bat :services:auth-service:test `
  --tests com.samhanair.logis.auth.domain.SalesCommissionSettlementPermissionSeedTest `
  --rerun-tasks --no-daemon --console=plain
```

### 3.1 정상 구성 — GREEN

변이 전과 네 변이 원복 후 각각 fresh 실행했다.

```text
정상 원본: BUILD SUCCESSFUL in 38s
최종 원복: BUILD SUCCESSFUL in 28s
```

즉, 중복 차단 수정이 정상 V101 권한을 막지 않는다.

### 3.2 초과 — RED

변이: 7-bit grant에 `DRIVER TRUE TRUE TRUE` 한 행 추가.

```text
SalesCommissionSettlementPermissionSeedTest > migrationSeedsTheExactSevenBitTemplateForEveryRole() FAILED
org.opentest4j.AssertionFailedError at SalesCommissionSettlementPermissionSeedTest.java:80
5 tests completed, 1 failed
BUILD FAILED in 41s
```

### 3.3 누락 — RED

변이: `ACCOUNTANT`의 7-bit grant 행 제거.

```text
SalesCommissionSettlementPermissionSeedTest > migrationSeedsTheExactSevenBitTemplateForEveryRole() FAILED
org.opentest4j.AssertionFailedError at SalesCommissionSettlementPermissionSeedTest.java:80
5 tests completed, 1 failed
BUILD FAILED in 37s
```

### 3.4 중복 — RED

변이: 기존 `MASTER TRUE TRUE TRUE` 앞에 `MASTER FALSE FALSE FALSE` 추가.

```text
SalesCommissionSettlementPermissionSeedTest > migrationSeedsTheExactSevenBitTemplateForEveryRole() FAILED
org.opentest4j.AssertionFailedError at SalesCommissionSettlementPermissionSeedTest.java:153
5 tests completed, 1 failed
BUILD FAILED in 32s
```

### 3.5 중복+초과 — RED

변이: `MASTER 000 → MASTER 111` 중복과 `DRIVER 111` 초과를 동시에 추가.

```text
SalesCommissionSettlementPermissionSeedTest > migrationSeedsTheExactSevenBitTemplateForEveryRole() FAILED
org.opentest4j.AssertionFailedError at SalesCommissionSettlementPermissionSeedTest.java:153
5 tests completed, 1 failed
BUILD FAILED in 39s
```

중복 단언이 먼저 RED여도 충분하다. 이 조합은 하나의 잘못을 다른 잘못이 상쇄하여 GREEN이 되지 않았다.

## 4. 차단 결함 — projection/catalog 중복 false-green

### 4.1 좌표 A: bucket flatten 후 `Set`

좌표:

- `clients/desktop/src/renderer/test-utils/permission-contract-checker.ts:38-39`
- 원천: `clients/desktop/src/renderer/test-utils/accounting-slip-permission-snapshot.ts`

현재 코드의 핵심은 다음이다.

```ts
return [...new Set(
  Object.values(PERMISSION_BITS_BY_ROLE)
    .flatMap((groups) => Object.values(groups).flat()),
)].sort()
```

재현 변이:

- `ACCOUNTANT`의 `accounting.sales-commission-settlement`을 원래 `1110000` bucket에 둔 채 `1000000` bucket에도 한 번 더 추가
- 즉 동일 `(ACCOUNTANT, accounting.sales-commission-settlement)`이 서로 다른 두 bits를 동시에 가진 불가능한 projection

실행:

```powershell
cd clients/desktop
npm test -- --run src/renderer/test-utils/accounting-slip-permission-contract.test.ts `
  --maxWorkers=1 --minWorkers=1
```

실제 결과 — **FALSE GREEN**:

```text
Test Files  1 passed (1)
Tests       10 passed (10)
Duration    1.06s
```

`Set`이 중복 page를 없애므로 catalog exact 비교가 중복 좌표를 볼 수 없다.

### 4.2 좌표 B: TypeScript 객체의 duplicate key last-write-wins

좌표:

- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-db-snapshot.ts:45`
- 현재 target은 역할별로 `:45`, `:154`, `:289` 등에 존재
- 소비자: `permission-contract-checker.ts:59-61,105-110`

재현 변이:

```ts
'accounting.sales-commission-settlement': '0000000',
'accounting.sales-commission-settlement': '1110000',
```

실제 결과 — **FALSE GREEN**:

```text
Duplicate key "accounting.sales-commission-settlement" in object literal
Test Files  1 passed (1)
Tests       10 passed (10)
```

빌드 도구는 경고했지만 exit code는 0이었다. import 이후에는 첫 값이 사라져 검사기가 중복을 복구할 수 없다.

### 4.3 좌표 C: backend projection parser의 `Map.put()` 덮어쓰기

좌표:

- `services/auth-service/src/test/java/com/samhanair/logis/auth/it/AccountingPermissionProjectionFreshnessIT.java:136-145`
- 특히 `:143 result.put(key(role, page), bits)`

위 B와 동일한 duplicate object key 변이를 넣고 다음을 실행했다.

```powershell
.\gradlew.bat :services:auth-service:test `
  --tests com.samhanair.logis.auth.it.AccountingPermissionProjectionFreshnessIT `
  --rerun-tasks --no-daemon --console=plain
```

실제 결과 — **FALSE GREEN**:

```text
BUILD SUCCESSFUL in 31s
12 actionable tasks: 12 executed
```

parser가 두 번째 값으로 첫 값을 덮으므로 source text 중복을 보존하지 않는다.

### 4.4 생성기 좌표

`scripts/refresh-accounting-permission-db-snapshot.ps1:69-85`도 raw rows를 `$byRole[$role][$page] = $bits`로 넣는다. 현재 DB는 unique index가 막지만, generator 자체는 입력 중복을 fail-fast하지 않는다. exact artifact 생성기의 경계에서도 중복 감지를 해야 한다.

변이 후 원복 SHA-256:

```text
accounting-slip-permission-snapshot.ts
68C58E08CC31B62CED000D3DB25AE803A39C0682ADF5206BBF3995461AF16785

accounting-slip-permission-db-snapshot.ts
2AA426DCBFB6860B452A1913CB97A227E394BF5F3D0292D8CE40F82ABC98169C

AccountingPermissionProjectionFreshnessIT.java
4E04C829FC3BA5329B650A291EEB9A0702970EDB284C41A76E7843B4EA92D08F
```

## 5. 동형 전수 조사

구현 보고서 `docs/dev-reports/2026-08-11-dg1-s4a-fix2.md`는 `bitsMap()`만 취약하다고 결론 냈다. 그 결론은 위 세 재현 때문에 불완전하다.

독립 조사는 build/dist/node_modules/test-results/generated 산출을 제외한 저장소 source에서 다음 집계 형태를 검색했다.

```text
new Set / new Map / Map.put / Collectors.toMap / groupingBy
flatMap / reduce / collect / Group-Object / Measure-Object
OR(|=) / SUM(+=)
```

구조 검색은 집계 사용 파일 914개, test/spec/contract/checker/snapshot/parity/guard/verify/validation 이름 후보 375개를 냈다. 그중 exact·snapshot·parity 단언과 raw 다중행 집계가 같이 있는 후보를 좁혀 검사했다. 권한 관련 후보는 별도로 모두 열어 분류했다.

| 후보 | 판정 | 이유 |
|---|---|---|
| `SalesCommissionSettlementPermissionSeedTest.bitsMap()` | 안전 | 이번 `seenRoles`가 raw row 중복을 put 전 차단 |
| `permission-contract-checker.snapshotPageCatalog()` | **결함** | bucket raw 행을 `Set`으로 합친 뒤 비교 |
| `AccountingPermissionProjectionFreshnessIT.parseProjection()` | **결함** | raw source cell을 `Map.put()`으로 덮음 |
| `accounting-slip-permission-db-snapshot.ts` | **결함 표면** | 객체 import가 duplicate key의 앞 값을 소실 |
| `refresh-accounting-permission-db-snapshot.ps1` | 보강 필요 | hashtable 대입 전 raw key 중복 단언 없음 |
| `permissionPageCatalog.parity.test.ts:84-94` | 안전 | `new Set(groupedPages).size == groupedPages.length`로 중복을 명시 단언 |
| Java `Collectors.toMap` exact 후보 | 안전 | merge function 없는 `toMap`은 duplicate key에서 예외 |
| `inbound-permission-contract.test.ts:37-38` | 동형 아님 | runtime action 응답을 membership 집합으로 소비하며 행 좌표 exact 정본 검사가 아님 |
| DB row → runtime map | schema 방어 | V39 `uq_rppt_active`, `uq_app_active`가 active `(role/page)`, `(account/page)` 중복 차단 |

권한 외 후보는 중복 자체가 허용된 비즈니스 집계, 중복을 별도 size로 단언한 검사, 또는 duplicate에서 예외를 내는 `toMap`으로 분류됐다. 이번 요청의 “여러 행을 합친 뒤 exact라고 단정하여 중복이 사라지는” 추가 재현은 위 projection/catalog 체인에서 발견됐다.

## 6. 검사 원천과 실제 런타임 원천

### 6.1 코드 추적

실제 account-form 판정 경로는 다음과 같다.

```text
SalesCommissionSettlementController
  PAGE_CODE = accounting.sales-commission-settlement
  @RequirePermission VIEW / CREATE / UPDATE
    ↓
PermissionAspect:193-207
  accountId 추출 → DynamicPermissionClient.check(accountId,page,action)
    ↓
DefaultDynamicPermissionClient:74
  GET /auth/internal/permissions/check?accountId=...&pageCode=...&action=...
    ↓
PermissionInternalController:60-79
  account-form → permissionService.check(accountId,pageCode,action)
    ↓
AccountPermissionService:65-66
  account_page_permissions 조회 → permission.allows(action)
```

V101은 role template뿐 아니라 builtin group과 `account_page_permissions` materialization까지 같은 7-bit grant로 갱신한다. SALES builtin group id는 102이며 신규 grant 대상이 아니다. ACCOUNTANT는 104이고 신규 grant 대상이다. 런타임 원천은 **시더와 단절된 다른 테이블이 아니라 V101이 materialize하는 `account_page_permissions`**다.

DB 고유성 방어:

- V39 `:53` — `uq_rppt_active`
- V39 `:84` — `uq_app_active`

### 6.2 실제 auth-service TCP 원문

공유 DB를 쓰지 않고, 임시 probe IT가 fresh local PostgreSQL에 auth migration V1~V101을 적용한 뒤 RANDOM_PORT Tomcat의 실제 `/auth/internal/permissions/check`를 호출했다. probe 파일은 실행 후 삭제했다.

SALES account `a0000000-0000-0000-0000-000000000004`:

```text
SOL_REVIEW3_AUTH_SALES_STATUS=200
SOL_REVIEW3_AUTH_SALES_BODY={"success":true,"code":"OK","message":"성공","data":{"allowed":false},"timestamp":"2026-08-11T10:51:10.325983500Z"}
```

ACCOUNTANT account `a0000000-0000-0000-0000-000000000005`:

```text
SOL_REVIEW3_AUTH_ACCOUNTANT_STATUS=200
parsed data.allowed=true
BUILD SUCCESSFUL in 1m 1s
```

ACCOUNTANT 응답의 status와 `data.allowed=true`는 실행 원문에서 확인했으나 timestamp를 별도 보존하지 않았으므로 재구성해 적지 않았다.

따라서 V101 materialized runtime 원천에서 SALES deny, ACCOUNTANT allow가 실제 TCP로 갈린다.

### 6.3 accounting-service 실제 403 HTTP 원문

기존 `SalesCommissionSettlementHttpGuardIT`는 accounting-service RANDOM_PORT에 실제 HTTP를 보내되 `DynamicPermissionClient`를 deny mock으로 둔다. 원문 재수집을 위해 출력만 임시 추가했다가 제거했다.

```text
SOL_REVIEW3_HTTP_STATUS=403
SOL_REVIEW3_HTTP_BODY={"success":false,"code":"FORBIDDEN","message":"[SP-PO-1] 동적 권한 deny ? page=accounting.sales-commission-settlement action=VIEW role=SALES reason=account permission missing","data":null,"timestamp":"2026-08-11T10:52:35.950806600Z"}
BUILD SUCCESSFUL in 1m 11s
```

즉, accounting edge의 403 변환과 auth runtime source의 SALES `allowed=false`를 각각 실제 TCP로 확인했고 코드 경로도 일치한다. 단, 두 프로세스를 동시에 연결한 gateway 포함 full-stack 한 요청은 이번 검토가 실행하지 않았다.

## 7. 라이브 QA

환경:

- 실행 위치: `clients/desktop`
- `npx playwright test ... --project=chromium --reporter=line`
- Playwright 1.59.1
- `node_modules/playwright-core/browsers.json`: Chromium revision 1217, headless-shell revision 1217
- headless, viewport 720×900
- 최종 결과: **2 passed (8.3s)**

첫 probe는 drawer를 `Escape`로 닫은 직후 transition overlay가 남은 400ms 안에 hit-test하여 다음 harness 실패를 냈다.

```text
locator center must be hit-test visible
authorized ACCOUNTANT enters CONFIRMED and DRAFT details and preserves scroll on back
```

실패 캡처에는 dim overlay가 남아 있었다. 제품 결함이 아니라 probe 대기 결함으로 판별해 transition 완료를 기다린 뒤 같은 가시성 단언을 다시 실행했고 2/2 GREEN이었다. 최종 단정은 단순 DOM 존재가 아니라 bounding box, viewport 내부, `elementFromPoint` hit target을 함께 사용했다.

확인 항목:

- ACCOUNTANT: 회계 메뉴와 정산 목록 실제 가시
- CONFIRMED: 문서번호 native anchor 클릭 → UUID route 진입, 표시 문서번호 `2026/08/11-1`, `확정` 표시
- 뒤로 가기: query 보존, `scrollY 720 → 720` exact 복귀
- DRAFT: 문서번호 없음, `임시저장`, 확정 CTA 실제 가시·hit-test
- SALES: 직접 route 진입 시 홈 redirect, 대상 sidebar 0개, 대상 제목 미노출
- UUID: URL 내부 route key로만 사용, body text UUID regex 0건

스크린샷:

- `docs/qa/2026-08-11-dg1-s4a-sol3/01-accountant-confirmed-detail.png`
- `docs/qa/2026-08-11-dg1-s4a-sol3/02-accountant-back-list-scroll-720.png`
- `docs/qa/2026-08-11-dg1-s4a-sol3/03-accountant-draft-detail.png`
- `docs/qa/2026-08-11-dg1-s4a-sol3/04-no-permission-route-hidden.png`

QA 전후 5173 포트는 모두 FREE였다. 별도 서버 listener를 남기지 않았다.

## 8. RED-B와 전체 회귀

### 8.1 정적·화면 표면

현재 `AppLayout.tsx` 직접 파싱:

```text
ACTIVE_COUNT=33 ACTIVE_UNIQUE=33 TARGET_HITS=1
ACCOUNTING_CATEGORY_TO_COUNT=44 TO_UNIQUE=44 TARGET_HITS=1
```

따라서 activeTargets 32→33, 렌더 anchor 43→44 및 신규 좌표 exact 1건은 보존됐다.

최종 정리 전에 임시 Playwright sweep을 추가로 실행해 이번 라운드에서도 직접 재확인했다.

```text
SOL3: 기존 회계 route 43개가 MASTER에서 모두 열린다
SOL3: MASTER 회계 그룹 anchor가 신규 포함 exact 44개다
2 passed (16.1s)
```

각 route에서 hash path 유지, NotFound 문구 0, 로그인 버튼 0을 단언했다. 임시 spec은 실행 후 삭제했다.

권한 snapshot과 mock에서 신규 page/action 좌표는 exact 1건이며 `1110000`이다. 사용자 기준 권한 matrix 61→62의 신규 좌표는 그대로다. 다만 이 섹션의 차단 결함 때문에 “중복 0”이라는 exact 보증은 현재 통과 결과만으로 신뢰할 수 없다.

### 8.2 accounting-service

```powershell
.\gradlew.bat :services:accounting-service:test --rerun-tasks --no-daemon --console=plain
```

```text
BUILD SUCCESSFUL in 7m 46s
JUnit XML 225 files
tests=1871 failures=0 errors=0 skipped=10
```

S1·S2 핵심 XML도 failure/error 없이 존재한다.

- `SalesCommissionSettlementNumberSequenceIT`
  - `createDraft_thenConfirm_thenFindByDocumentNo_roundTripsTheSameSettlement`
- `SalesCommissionSettlementRateVersionIT`
  - `persisted_versions_keep_their_own_confirmed_settlement_snapshots_after_reload`
- `SalesCommissionSettlementCalculationSnapshotTest`
  - `old_settlement_snapshot_does_not_change_when_a_new_rate_version_is_used`

즉 채번, versioned 계약, CONFIRMED snapshot 불변은 보존됐다.

### 8.3 desktop

첫 전체 실행:

```powershell
npm test -- --run --maxWorkers=1 --minWorkers=1
```

exit code 0. 정확한 분모를 고정하려고 다시 fresh JSON reporter로 실행했다.

```powershell
npx vitest run --maxWorkers=1 --minWorkers=1 `
  --reporter=json --outputFile=.sol3-vitest.json
```

```text
numTotalTests=2163
numPassedTests=2162
numFailedTests=0
numPendingTests=1
success=true
duration=259.9s
```

따라서 **현재 워크트리의 직접 재현값은 2,162 passed + 1 skipped**다. 구현 보고의 `2,161 passed + 1 skipped`보다 통과 test가 1개 많다. 실패나 RED-B 손실은 아니지만, 제시된 분모 2,162 total은 이 라운드에서 재현되지 않았다. 임시 JSON은 집계 후 삭제했다.

입금보고서 준용분은 native link 상세 진입과 scroll 720 복귀를 이번 Playwright에서 직접 재확인했다.

## 9. 구현자 수정 지시서

### 9.1 불변식

1. raw permission projection의 모든 `(role,pageCode)` 좌표는 **Map/Set/object/OR/SUM/merge 전에 정확히 한 번** 나타나야 한다.
2. bucket 표현에서는 역할 하나 안의 모든 `(bits,pageCode)`를 순회하면서 `role|pageCode`의 최초 출현을 기록한다. 같은 bits 재등장과 다른 bits 재등장을 모두 RED로 한다.
3. 중복 감지는 값, 행 순서, 뒤의 overwrite 결과와 독립적이어야 한다.
4. raw uniqueness를 통과한 뒤에만 역할 11종, page catalog, 7-bit exact matrix를 비교한다.
5. DB unique index는 projection/source parser의 중복 검사를 대신하지 않는다.

### 9.2 수정 좌표 전수

1. `permission-contract-checker.ts:38-39`
   - `snapshotPageCatalog()`에서 바로 `Set`을 반환하지 말 것.
   - 역할별 bucket raw page를 전부 순회하며 `seen role|page` duplicate를 먼저 단언할 것.
   - bit key가 정확히 `[01]{7}`인지, 역할/page catalog가 exact인지도 같은 raw 단계에서 단언할 것.
2. `AccountingPermissionProjectionFreshnessIT.java:136-145`
   - `result.put()` 전에 별도 `seenCells.add(role|page)`를 단언할 것.
   - duplicate role block과 duplicate cell을 구분한 오류에 역할·page·앞 bits·뒤 bits를 출력할 것.
3. `accounting-slip-permission-db-snapshot.ts`
   - 객체를 import한 뒤에는 duplicate를 알 수 없다. raw source parser로 duplicate key를 먼저 검사하거나, artifact 표현을 row array로 바꾸고 uniqueness 검사 후 map을 만들 것.
   - Vite duplicate-key warning만으로는 RED가 아니므로 허용하지 말 것.
4. `refresh-accounting-permission-db-snapshot.ps1:69-85`
   - `$byRole[$role][$page] = $bits` 전에 raw `(role,page)` seen set으로 fail-fast할 것.
5. DB query 결과를 map으로 만드는 freshness 경로 `AccountingPermissionProjectionFreshnessIT.java:78-90`
   - schema가 방어하더라도 put 전 duplicate 단언을 유지해 검사 원천 자체가 fail-closed임을 보일 것.

### 9.3 재현 데이터와 필수 새 조합

아래를 각각 실제 mutation으로 넣고 모두 RED 원문을 남길 것.

1. 같은 role/page: `0000000` 먼저, `1110000` 나중
2. 같은 role/page: `1110000` 먼저, `0000000` 나중
3. 같은 role/page/bits 동일 행 2회
4. DB projection object: bad bits 먼저, 기대 bits 나중
5. DB projection object: 기대 bits 먼저, bad bits 나중
6. duplicate + 초과 role/page 동시
7. duplicate + 다른 role/page 누락 동시
8. 현재 0-bit 역할에서 duplicate 후 기대 0으로 상쇄
9. 비교하는 두 source를 똑같이 중복 오염시킨 대칭 변이
10. 11개 역할 전체와 7 action 위치 각각에 대해 적어도 table-driven 경계 검사

정상 source는 반드시 GREEN이어야 한다. duplicate 오류는 최소 `(role,pageCode,firstBits,secondBits)`를 원문에 포함해야 한다.

### 9.4 RED-A

- 위 10개 조합의 중복은 desktop contract와 backend freshness 중 담당 gate에서 모두 RED
- 기존 V101 초과·누락·중복·중복+초과 4종도 계속 RED
- 두 비교 원천이 같은 방식으로 오염돼도 GREEN 금지
- generator 입력 중복도 artifact 생성 전 RED

### 9.5 RED-B

- 정상 V101과 정상 projection GREEN
- SALES deny, ACCOUNTANT allow 유지
- accounting actual HTTP 403 유지
- activeTargets 33, 렌더 anchor 44, 신규 permission 좌표 exact 1 유지
- 기존 회계 43 route open 유지
- native Link 및 scroll 720→720 유지
- 화면 문자열 UUID 0건 유지
- 채번, versioned 계약, CONFIRMED snapshot 불변 유지
- accounting 1,871 tests failure/error 0
- desktop failure 0; 수정 후 fresh reporter의 실제 분모를 보고서와 일치시킬 것

### 9.6 중단 조건

**제 전제가 틀렸다면 고치지 말고 중단·보고하십시오.** 특히 duplicate bucket/object key가 합법이라는 도메인 계약, 또는 비교 원천이 runtime과 의도적으로 다르다는 근거가 있다면 먼저 그 계약과 소비 코드를 제시해야 한다. 근거 없이 `Set`, `Map.put`, 객체 last-write-wins를 유지하지 말 것.

## 10. 정리 상태와 이번 라운드가 덮지 않은 표면

- 네 V101 mutation 모두 원복 및 hash 일치
- desktop snapshot 두 파일과 backend freshness IT 원복 및 hash 일치
- 임시 auth runtime probe 삭제
- 임시 accounting 출력 삭제
- 임시 Playwright spec 삭제
- 임시 Vitest JSON 삭제
- migration/mock 제품 파일에 검토 변이 잔존 없음
- QA listener 없음(5173 FREE)
- 공유 DB write 없음
- git 명령/조작 없음

이번 라운드는 gateway→accounting-service→auth-service 두 프로세스를 동시에 연결한 배포형 full-stack 403과 공유 DB write를 의도적으로 실행하지 않았다. 전자는 코드 추적 + auth 실제 TCP allowed=false + accounting 실제 TCP 403의 두 경계 증거로 대조했다. 기존 43 route는 이번 라운드의 별도 Playwright sweep으로 43/43을 다시 확인했다. merge 판단 전에는 우선 본 보고서의 projection duplicate false-green을 닫아야 한다.
