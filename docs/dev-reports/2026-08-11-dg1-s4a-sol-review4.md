# DG1 S4a SOL 재검토4 — PR #1170

- 검토일: 2026-08-11 (Asia/Seoul)
- 대상: PR #1170, 사용자 제시 HEAD `41936a3f6`
- 역할: CODEX SOL 5.6 코드 검토
- 범위: 중복 뮤테이션 5종, fix3 전수표, PowerShell 5.1 generator, RED-B, 직접 Playwright 라이브 QA
- 제한 준수: git 조작 없음, 공유 DB write 없음. DB snapshot generator는 격리된 일회용 로컬 Docker PostgreSQL만 사용했다.

## 1. 판정

**MERGE BLOCKED — 결함 3건.**

다섯 중복 뮤테이션은 전부 RED였고 복원 후 정상 계약도 GREEN이었다. fix2의 4종 뮤테이션, V101 정상, runtime deny, 실제 HTTP 403, route/count, 전체 accounting/desktop/typecheck, 직접 Playwright QA도 보존됐다.

그러나 다음 결함 때문에 지금 상태로는 머지 판단을 승인할 수 없다.

1. **SOL-S4A-R4-01 / BLOCKING — PowerShell 5.1 정상 생성이 byte-idempotent하지 않다.**
   - `scripts/refresh-accounting-permission-db-snapshot.ps1:106`이 `[Environment]::NewLine`으로 출력한다.
   - 체크인 snapshot은 LF인데 Windows PowerShell 5.1 정상 실행 결과는 CRLF다.
   - 실행 전 SHA-256 `2AA426DCBFB6860B452A1913CB97A227E394BF5F3D0292D8CE40F82ABC98169C`
   - 정상 실행 직후 SHA-256 `9E90C3B552DD08E79E9CE606B37F89C66DA100B3CC7DE10622AFBAE541F1A979`
   - 의미 데이터는 같지만 정상 refresh 한 번으로 추적 산출물이 바뀐다. 저장소 표준 런타임인 PS 5.1에서 generator가 정상 입력을 깨끗하게 재생성하지 못한다.

2. **SOL-S4A-R4-02 / MAJOR — PowerShell 5.1 실패 진단이 온전히 읽을 수 없다.**
   - 중복 DB row를 넣으면 대입 전에 exit 1이고 출력 파일은 기존 SHA-256 `2AA426...` 그대로여서 fail-fast 위치 자체는 맞다.
   - 그러나 실제 첫 줄은 `DB ?뚯깮 ?ㅻ깄??媛깆떊 以묐떒: duplicate projection cell ACCOUNTANT|accounting.accounts first/second bits cannot be represented`처럼 한국어가 깨진다.
   - 이어서 `At ... line:80 char:5`, `CategoryInfo`, `FullyQualifiedErrorId` 스택이 그대로 나온다.
   - 좌표의 영문 부분은 식별 가능하지만 “읽을 수 있는 메시지이며 스택만 나오지 않아야 한다”는 요청을 충족하지 않는다.

3. **SOL-S4A-R4-03 / EVIDENCE INTEGRITY — fix3 전수표가 한 좌표의 source/unique 제약을 잘못 인용하고 표 밖 후보를 누락했다.**
   - `docs/dev-reports/2026-08-11-dg1-s4a-fix3.md:97`은 `DynamicPermissionService.java:126-129`의 원천을 role template이라 하고 V39 `uq_rppt_active`를 인용한다.
   - 실제 코드는 `DynamicPermissionService.java:47`의 `RolePagePermissionRepository`를 통해 `RolePagePermission`을 `:123`에서 읽고 `:126-129`에 적재한다.
   - 이 흐름을 덮는 제약은 V39가 아니라 `V7__add_role_page_permissions.sql:34-36`의 `uq_role_page_permissions_active(role_code,page_code) WHERE is_deleted=false`다. `RolePagePermission.java:36`에도 active-row `@SQLRestriction`이 있다.
   - 따라서 runtime은 우연히 안전한 것이 아니라 **다른 제약으로 안전**하다. 보고서의 사실 근거는 틀렸다.
   - 표는 Markdown 데이터 행으로는 15행이며, `GroupPermissionService`의 두 좌표를 따로 세면 16좌표다. “16행” 표기는 정확하지 않다.
   - broad grep에서 같은 권한 데이터 흐름의 `PermissionInternalController.java:128-137`, `AccountPermissionService.java:93-104`, `AccountPermissionService.java:303-307`, `GroupPermissionService.java:96-102`도 나왔지만 표에 명시되지 않았다. `기타` 한 줄로 전수 완료를 주장한 근거는 불충분하다.

## 2. 첫 각도 — 중복 뮤테이션 5종 원문

모든 mutation은 실제 파일 또는 실제 입력을 일시 변형해 실행했고 즉시 원복했다. 마지막 정상 GREEN과 파일 해시로 복원을 확인했다.

| # | 직접 넣은 중복 | 실행 결과 | 핵심 원문 |
|---:|---|---:|---|
| 1 | bucket에 ACCOUNTANT/`accounting.sales-commission-settlement`를 `1000000`과 `1110000`에 동시 배치 | RED | `duplicate snapshot cell ACCOUNTANT|accounting.sales-commission-settlement firstBits=1000000 secondBits=1110000: expected { bits: '1000000' } to be undefined` |
| 2 | TS snapshot MASTER 객체에 같은 page key를 두 번 작성 | RED | `duplicate projection cell MASTER|accounting.sales-commission-settlement firstBits=0000000 secondBits=1110000` 및 Vite `Duplicate key` 경고 |
| 3 | Java가 읽는 projection source에 MASTER 동일 cell 행 두 번 작성 | RED | `org.opentest4j.AssertionFailedError: [duplicate projection cell MASTER|accounting.sales-commission-settlement firstBits=0000000 secondBits=1110000] expected: null but was: "0000000"` |
| 4 | freshness IT의 DB query에 `UNION ALL`로 동일 DB row를 한 번 더 반환 | RED | `org.opentest4j.AssertionFailedError: [duplicate auth_db cell ACCOUNTANT|accounting.accounts bits=1111000] Expecting value to be true but was false` |
| 5 | `mock.ts`의 `SP_D1_DEFAULT_EDIT.ACCOUNTANT`에서 방금 제거한 정산 page를 다시 중복 | RED | `expected [] to deeply equal ["ACCOUNTANT|accounting.sales-commission-settlement"]` |

정상 구성 재실행:

- desktop permission contract: **13 passed / 0 failed**
- `AccountingPermissionProjectionFreshnessIT`: **2 passed / BUILD SUCCESSFUL**
- 즉, 다섯 중복은 거부하면서 정상 계약은 막지 않았다.

## 3. 두 번째 각도 — fix3 전수표 감사

### 3.1 인용 unique 제약 실재 확인

| 제약 | 실제 좌표 | 정의 | 판정 |
|---|---|---|---:|
| V39 `uq_rppt_active` | `V39__account_page_permissions_overhaul.sql:53-55` | `(role_code, page_code) WHERE is_deleted=false` | 실재 |
| V39 `uq_app_active` | `V39__account_page_permissions_overhaul.sql:84-86` | `(account_id, page_code) WHERE is_deleted=false` | 실재 |
| V42 `uq_group_page_permissions_active` | `V42__permission_groups_tables.sql:58-60` | `(group_id, page_code) WHERE is_deleted=false` | 실재 |
| V7 `uq_role_page_permissions_active` | `V7__add_role_page_permissions.sql:34-36` | `(role_code, page_code) WHERE is_deleted=false` | 실재, fix3 표가 누락한 올바른 근거 |

### 3.2 표의 16좌표 재분류

fix3 표에는 데이터 행이 15개 있고 `GroupPermissionService` 한 행에 두 좌표가 묶여 있어 구체 좌표는 16개다.

| # | fix3 후보/좌표 | 감사 결과 |
|---:|---|---|
| 1 | checker bucket catalog | raw `(role,page)` seen 후 catalog 적재. mutation 1 RED. 안전 |
| 2 | raw TS snapshot source | import 결과가 아니라 raw source duplicate key 검사. mutation 2 RED. 안전 |
| 3 | freshness IT `parseProjection()` | role block/cell seen 후 put. mutation 3 RED. 안전 |
| 4 | freshness IT DB query row → Map | DB row seen 후 put. mutation 4 RED. 안전 |
| 5 | PS generator | HashSet 검사가 hashtable 대입 전 실행. 중복에서는 출력 미변경. 중복 방어는 안전하나 R4-01/02 별도 결함 |
| 6 | mock `SP_D1_DEFAULT_EDIT` | source duplicate test가 mutation 5를 RED. 안전 |
| 7 | seed test `bitsMap()` | `seenRoles`가 put 전 실행. fix2 duplicate RED. 안전 |
| 8 | catalog parity | Set size와 원 배열 length exact 비교. 안전 |
| 9 | inbound action Set | `(role,page)` projection이 아니라 한 cell의 action membership이며 별도 7-action exact 비교. 안전 |
| 10 | `permissionsApi.ts:486-499` | 동일 cell의 action item을 DTO로 정규화하는 API 계약. exact projection 검사가 아님. 안전 |
| 11 | `AccountPermissionService.java:160-165` | active account row는 V39 `uq_app_active`와 `AccountPagePermission.java:27` restriction을 통과. 이 조회 경로는 안전 |
| 12 | `GroupPermissionService.java:40-46` | active group row는 V42 unique와 `GroupPagePermission.java:26` restriction을 통과. 안전 |
| 13 | `GroupPermissionService.java:127-133` | 같은 repository/source/제약을 사용. 안전 |
| 14 | `DynamicPermissionService.java:126-129` | **표 근거 오기.** 실제 source는 legacy `RolePagePermission`; V7 unique와 `RolePagePermission.java:36` restriction이 보호하므로 runtime은 안전 |
| 15 | `EffectivePermissionMaterializer.java:103-115` | 여러 assigned group의 동일 page 권한을 action별 OR하는 도메인 동작. 안전 |
| 16 | `EffectivePermissionMaterializer.java:117-120` override | `override(page) ?? OR(groups)`의 명시적 precedence. exact source 비교가 아님. 안전 |

### 3.3 표 밖 후보

권한 코드뿐 아니라 accounting report/service의 `put`, `toMap`, `groupingBy`, `computeIfAbsent`, TS `Map`/`Set`을 broad grep했다.

권한 흐름에서 표 밖으로 나온 좌표:

- `PermissionInternalController.java:128-137`: legacy `RolePagePermission`을 role/page DTO map으로 만든다. V7 active unique와 entity restriction이 덮는다.
- `AccountPermissionService.java:93-104`: account active rows를 page map으로 만든다. V39 `uq_app_active`와 entity restriction이 덮는다.
- `AccountPermissionService.java:303-307`: role templates를 role/page map으로 만든다. V39 `uq_rppt_active`와 `RolePagePermissionTemplate.java:26` restriction이 덮는다.
- `GroupPermissionService.java:96-102`: request의 동일 page update를 last-write-wins로 정규화한다. DB projection exact 비교가 아니라 API 입력 정규화 계약이다. 중복 입력의 의도 자체는 별도 API 정책 표면이다.

권한 밖 도메인 표본:

- `CashFlowStatementService.java:323-325`의 account map은 `JournalLineRepository.java:431`의 `GROUP BY l.accountCode` 결과를 받는다.
- `AccountStatementService.java:179`의 `(accountCode,partnerId)` map은 `JournalLineRepository.java:321`의 동일 키 `GROUP BY` 결과를 받는다.
- `TrialBalanceSummaryService.java:152`의 account map 역시 account별 집계 query 결과를 받는다.
- `EquityChangesService`의 `Collectors.toMap`은 merge function이 없어 중복이면 조용히 덮지 않고 예외로 실패한다.

이번 권한 exact 비교와 같은 false-green 후보는 위 권한 표 밖 좌표에서 추가로 발견되지 않았다. 다만 fix3 보고서는 이 좌표를 명시하지 않은 채 `기타`로 전수 완료를 주장했으므로 증거 정정이 필요하다.

### 3.4 `EffectivePermissionMaterializer` OR union

주장은 맞다.

- `EffectivePermissionMaterializer.java:24`: `override(page) ?? OR(group_page_permissions)` 계약을 문서화한다.
- `:62-63`: group union 후 override를 적용한다.
- `:103-115`: 여러 그룹 row를 page별로 합친다.
- `:117-120`: account override를 별도 우선순위로 적용한다.
- 이 materializer는 runtime effective permission 계산 경로이며, role-template migration/TS snapshot/auth DB를 exact 비교하는 `AccountingPermissionProjectionFreshnessIT`나 desktop permission contract에 사용되지 않는다.

## 4. 세 번째 각도 — generator 실측

### 4.1 런타임

```text
Windows PowerShell 5.1.26100.8972
Docker Server 29.6.2
```

### 4.2 정상 입력

실제 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\refresh-accounting-permission-db-snapshot.ps1`를 실행했다.

```text
exit 0
V101까지 총 100개 migration 적용
일회용 network/container cleanup 0건 잔류
before SHA-256: 2AA426DCBFB6860B452A1913CB97A227E394BF5F3D0292D8CE40F82ABC98169C
after  SHA-256: 9E90C3B552DD08E79E9CE606B37F89C66DA100B3CC7DE10622AFBAE541F1A979
```

행 데이터는 동일하고 차이는 LF→CRLF였다. 정상 생성 자체는 성공하지만 체크인 산출물과 byte-idempotent하지 않으므로 GREEN으로 판정하지 않는다. 검토 후 snapshot은 원래 LF/`2AA426...`로 복원했다.

### 4.3 실패 입력

DB query 결과 직후 첫 row를 한 번 더 추가해 중복 DB row를 만들었다.

```text
exit 1
DB ?뚯깮 ?ㅻ깄??媛깆떊 以묐떒: duplicate projection cell ACCOUNTANT|accounting.accounts first/second bits cannot be represented
At ... refresh-accounting-permission-db-snapshot.ps1:80 char:5
CategoryInfo ...
FullyQualifiedErrorId ...
output SHA-256: 2AA426DC... (변경 없음)
cleanup 잔류: 0
```

검증-before-assignment와 cleanup은 맞지만 메시지 품질은 R4-02다.

## 5. RED-B 보존

### 5.1 fix2 뮤테이션 4종

`SalesCommissionSettlementPermissionSeedTest.migrationSeedsTheExactSevenBitTemplateForEveryRole`에 직접 넣어 모두 RED를 확인하고 복원했다.

| mutation | 결과 |
|---|---:|
| 초과: DRIVER grant 추가 | RED, test line 80 |
| 누락: ACCOUNTANT grant 제거 | RED, test line 80 |
| 중복: MASTER row 중복 | RED, duplicate guard line 153 |
| 중복+초과 | RED, duplicate guard line 153 |

복원 후 `SalesCommissionSettlementPermissionSeedTest` 전체는 `BUILD SUCCESSFUL`이다.

### 5.2 권한·route·count

- V101 정상 seed: GREEN
- SALES mock 목록·생성·확정 API 403: **1 passed**
- accounting `SalesCommissionSettlementHttpGuardIT`: 실제 embedded TCP HTTP로 **403 계약 GREEN**
- `activeTargets`: **33 / unique 33 / target 1**
- accounting render menu: **44**, 기존 route **43/43 open 성공**
- 권한 matrix: **62 / unique 62 / target 1**
- native settlement document links: **2**
- back scroll: **720 → 720**

### 5.3 전체 회귀

| suite | 실측 |
|---|---:|
| accounting 전체 | `BUILD SUCCESSFUL`, XML suite 225개, tests **1,871**, failures 0, errors 0, skipped 10 |
| desktop 전체, single worker | exit 0, runnable **2,165**, skipped **1** |
| desktop typecheck | exit 0 |

Gradle XML 225개 중 62개는 기존 한글 testcase name encoding 때문에 XML DOM 파서가 본문을 읽지 못했다. 수치 집계는 ASCII인 각 `<testsuite>` 헤더의 `tests/failures/errors/skipped`를 225개 전수 정규식 집계했고, 누락 header는 0개였다.

## 6. 직접 Playwright 라이브 QA

Codex 내장 브라우저 런타임은 사용하지 않았다. `clients/desktop`에서 다음 Chromium을 직접 실행했다.

```text
C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe
headless=true
```

fresh run 원문 요약:

```text
ACCOUNTANT_DRAFT=PASS ACCOUNTANT_CONFIRMED=PASS SALES_DENY=PASS
SCROLL=720->720 NATIVE_LINKS=2
ACCOUNTING_ROUTES=44 LEGACY_ROUTES_OK=43
```

확인한 흐름:

- 권한 있음 ACCOUNTANT: 목록 → DRAFT 문서번호 링크 → 상세 → 뒤로 가기, scroll 720 복귀
- ACCOUNTANT CONFIRMED 상세
- 권한 없음 SALES: 정산 menu/route deny
- 기존 43개 accounting route 전부 open

스크린샷:

1. `docs/qa/2026-08-11-dg1-s4a-sol4/01-accountant-list.png` — 1440×1912
2. `docs/qa/2026-08-11-dg1-s4a-sol4/02-accountant-draft-detail.png` — 1440×1912
3. `docs/qa/2026-08-11-dg1-s4a-sol4/03-accountant-list-back-720.png` — 1440×900
4. `docs/qa/2026-08-11-dg1-s4a-sol4/04-accountant-confirmed-detail.png` — 1440×1912
5. `docs/qa/2026-08-11-dg1-s4a-sol4/05-sales-denied.png` — 1440×900

라이브 QA용 임시 JS와 mutation test 파일은 삭제했다. 이 worktree에서 띄운 Vite는 종료했다. 최종 포트 감사 시 5173 listener 1개가 있었으나 PID 105404의 명령행은 별도 worktree `wdg1s3`의 Vite였으므로 건드리지 않았다.

## 7. 구현자 지시서

### 7.1 불변식

1. PowerShell 5.1 정상 refresh는 체크인 snapshot과 byte-for-byte 동일해야 한다. 기존 LF, UTF-8 no BOM, SHA-256 `2AA426...`을 보존한다.
2. duplicate/invalid DB row 검증은 output 대입 전에 실패해야 하며 기존 output byte를 바꾸지 않는다.
3. 실패는 role/page cell을 포함한 읽을 수 있는 한 줄 메시지를 우선 출력하고 exit 1이어야 한다. PS 5.1에서 한글 깨짐과 불필요한 PowerShell 스택을 남기지 않는다.
4. 보고서의 source table, repository, entity active filter, DB unique index 연결은 실제 데이터 흐름과 일치해야 한다.
5. 다섯 duplicate mutation RED와 정상 GREEN, fix2 4종 RED, RED-B 전체를 잃지 않는다.

### 7.2 수정·감사 좌표 전수

- `scripts/refresh-accounting-permission-db-snapshot.ps1:1-108`
  - PS 5.1 source/message encoding
  - `:18,22,37,42,49,58,63,75,79` 실패 경로
  - `:106` LF/UTF-8 no BOM deterministic write
- `clients/desktop/src/renderer/test-utils/accounting-slip-permission-db-snapshot.ts`
- `docs/dev-reports/2026-08-11-dg1-s4a-fix3.md:83-101`
- `DynamicPermissionService.java:47,123-129`
- `RolePagePermission.java:36`
- `V7__add_role_page_permissions.sql:34-36`
- 표 밖 명시 대상:
  - `PermissionInternalController.java:128-137`
  - `AccountPermissionService.java:93-104,158-165,303-307`
  - `GroupPermissionService.java:38-46,96-102,124-133`
  - `EffectivePermissionMaterializer.java:24,62-63,103-120`
- unique 근거:
  - V39 `:53-55`, `:84-86`
  - V42 `:58-60`
  - V7 `:34-36`

### 7.3 재현 데이터

1. 정상 PS 5.1 generator 실행 전/후 snapshot SHA-256을 비교한다. 현재는 `2AA426...` → `9E90C3...`으로 변한다.
2. DB query row list에 첫 row를 한 번 더 넣는다. 현재는 대입 전 RED지만 한국어가 깨지고 스택이 노출된다.
3. fix3 표의 `DynamicPermissionService` source를 따라가면 `RolePagePermissionRepository`/V7에 도달하며 V39 template에는 도달하지 않는다.

### 7.4 RED-A 표적

- PS 5.1 정상 refresh exit 0 + 실행 전후 SHA-256 동일 + 출력 LF/UTF-8 no BOM.
- duplicate DB row에서 exit 1 + output SHA-256 불변 + `ACCOUNTANT|accounting.accounts` 포함 + 한글/ASCII 메시지 정상 + 일반 스택 미노출 + Docker 잔류 0.
- invalid bits/invalid row도 같은 진단 계약.
- fix3 전수표가 15 data row/16 coordinate를 정확히 표현하고, 각 coordinate별 repository→entity filter→unique 또는 domain merge 근거를 적는다.
- `DynamicPermissionService`는 V7 제약을 인용한다.

### 7.5 RED-B 표적

- 이번 5종 duplicate mutation 전부 RED, 정상 desktop 13 및 freshness IT 2 GREEN.
- fix2 초과·누락·중복·중복+초과 4종 RED, V101 정상 GREEN.
- SALES runtime deny, accounting 실제 HTTP 403.
- activeTargets 33, render route 44, matrix 62, target 각 1.
- 기존 43 route 전부 open, native Link 2, scroll 720→720.
- accounting 1,871 / desktop 2,165+1 skipped / typecheck GREEN.
- 직접 Chromium ACCOUNTANT DRAFT/CONFIRMED 및 SALES deny 스크린샷 보존.

**제 전제가 틀렸다면 고치지 말고 중단·보고.**

## 8. 이 라운드가 보지 않은 표면

- 공유/운영 DB write와 실제 운영 데이터 migration은 금지 조건 때문에 보지 않았다.
- 운영 gateway/JWT/SSO를 통과하는 배포 환경 HTTP는 보지 않았다. HTTP 403은 accounting-service embedded TCP IT로 확인했다.
- packaged Electron 실행, 모바일 클라이언트, 실제 Windows installer는 보지 않았다.
- 동시 다중 계정 권한 변경과 materializer 경쟁 조건은 보지 않았다.
- 한국어가 아닌 다른 Windows system locale의 PowerShell 5.1 출력은 보지 않았다.

## 9. 최종 복원/청소 증거

```text
V101 SHA-256     B173883CED1D2A54A0FE378285DA460D03011EDA110E409D42DCC7D2D1C12327
snapshot SHA-256 2AA426DCBFB6860B452A1913CB97A227E394BF5F3D0292D8CE40F82ABC98169C
seed test SHA-256 E1672A25BD89276DB11A60FDF6A39758465C94AED616AD56AB5FCCEED1D2F5B4
generator SHA-256 5222D6C8CD0F8A38DCF45687EFA7A9D179B947C94408FD26F7087B52022B52CB
Docker refresh leftovers 0
temporary QA script false
temporary mutation test false
```
