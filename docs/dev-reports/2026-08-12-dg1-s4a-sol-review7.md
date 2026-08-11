# PR #1170 D-G1 S4a SOL 5.6 재검토7 — 머지 판단

- 검토일: 2026-08-12 (Asia/Seoul)
- 대상 HEAD: `38bec9250ad6c420bea4aab87090cec9df31d05d`
- 대상 커밋: `[FIX] #1170 S4a fix6 — 가드를 비ASCII 계열 전체로 · 라이브 스펙 -real-qa 규약`
- 범위: 전체 real-QA 추적 scope, 비ASCII canonical inventory, 9종 mutation, PowerShell 5.1 generator, RED-B, 직접 Playwright
- git 변경 명령: 0건
- 공유 DB write: 0건
- 판정: **결함 0 — MERGE 승인**

## 1. 최종 판정

재검토6의 blocking 2건은 닫혔다.

1. UTF-8 가드는 generator·생성 snapshot·permission checker의 비ASCII 전체 라인을 exact inventory로 비교한다. 한국어 mojibake, `×`, `↔`, checker 한글 변이, 생성 snapshot의 새 비ASCII 문자 추가를 실제 파일에 각각 넣었을 때 모두 RED였다. 정상 상태는 15/15 GREEN이다.
2. 추적 라이브 QA 스펙의 디렉터리와 파일명이 모두 `-real-qa` 규약을 만족한다. 커밋된 HEAD에서 전체 real-QA 추적 scope가 통과했고 직접 Chromium-1217 QA도 5/5 통과했다.

9종 mutation, 정상 계약, PowerShell 5.1 멱등성·인코딩·실패 진단, RED-B, 전체 desktop/accounting 회귀에서 새 제품 결함을 발견하지 못했다.

## 2. 첫 임무 — 전체 real-QA 추적 scope 원문

커밋된 HEAD에서 `clients/desktop` 안에서 실행했다.

```powershell
npm run typecheck:real-qa
```

원문 요약:

```text
> @samhan/desktop@0.1.0 typecheck:real-qa
> node --test scripts/real-qa-cleanup-scope.test.cjs && node --test scripts/real-qa-scope.test.cjs

✔ playwright/869-ds4-real-qa/869-ds4-real-qa.spec.ts keeps cleanup id outside its try block
✔ playwright/869-ds4-real-qa/ds4-body-layer-regression-real-qa.spec.ts keeps cleanup id outside its try block
ℹ tests 2
ℹ pass 2
ℹ fail 0

✔ PR #1164 live-login spec is registered in the shared real-QA disk scope
✔ real-QA 공식 수집 집합은 현재 Git 추적 집합과 이름 단위로 일치한다(.gitignore 가 허용한 로컬 스펙은 예외)
...
✔ 결함7: "확인 완료" 메시지가 실제 검사 대상만 명시하고 범위를 과장하지 않는다
ℹ tests 51
ℹ suites 0
ℹ pass 51
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 24190.6883
```

- 명령 exit: `0`
- cleanup scope: `2/2`
- real-QA scope: `51/51`
- 출력 중 `[real-QA 추적 집합 불일치]`는 scope 단위 테스트가 의도적으로 만든 RED fixture의 진단 원문이다. 최종 runner fail은 0이다.
- fix6 이전의 “새 파일이 Git 추적 목록에 없어 전체 scope가 차단” 상태는 재현되지 않았다.

## 3. 두 번째 임무 — 비ASCII 전수와 가드의 실제 경계

### 3.1 실제 파일 전수 추출

strict UTF-8로 세 파일을 읽고 비ASCII가 하나라도 있는 모든 라인과 code point를 직접 집계했다.

| 파일 | 비ASCII 라인 | 고유 비ASCII code point | 계열 |
|---|---:|---:|---|
| `scripts/refresh-accounting-permission-db-snapshot.ps1` | 13 | 88 | 한글 음절 87종 + `U+00D7 ×` |
| 생성 `accounting-slip-permission-db-snapshot.ts` | 1 | 1 | `U+00D7 ×` |
| `permission-contract-checker.ts` | 7 | 35 | 한글 음절 33종 + `U+00D7 ×` + `U+2194 ↔` |

generator 13줄 전수:

```text
  throw 'DB 파생 스냅샷 갱신 중단: docker 명령이 없습니다.'
if (-not $pageMatch.Success) { throw 'PERMISSION_PAGE_CODES를 찾지 못했습니다.' }
# 공유 auth_db의 적용 여부에 의존하지 않는다. 매번 일회성 PostgreSQL에 저장소의
# migration 전체를 Flyway로 적용한 뒤 그 결과만 SELECT한다. 이 컨테이너/네트워크는
# finally에서 제거되므로 운영 DB에는 쓰기가 발생하지 않는다.
  if ($LASTEXITCODE -ne 0) { throw '임시 Docker 네트워크 생성에 실패했습니다.' }
  if ($LASTEXITCODE -ne 0) { throw '임시 PostgreSQL 컨테이너 생성에 실패했습니다.' }
  if (-not $databaseReady) { throw '임시 PostgreSQL이 준비되지 않았습니다.' }
  if ($LASTEXITCODE -ne 0) { throw '전체 migration 적용에 실패했습니다. projection을 갱신하지 않습니다.' }
    throw 'DB 파생 스냅샷 갱신 중단: 전체 migration DB SELECT가 실패했거나 결과가 비었습니다. 기존 체크인 산출물로 조용히 대체하지 않습니다.'
    throw "DB 파생 스냅샷 갱신 중단: 잘못된 projection row '$row'"
    throw "DB 파생 스냅샷 갱신 중단: duplicate projection cell $cell first/second bits cannot be represented"
$lines.Add('// Scope: PERMISSION_ROLES × PERMISSION_PAGE_CODES. Missing DB rows are 0000000.')
```

생성 snapshot 1줄 전수:

```text
// Scope: PERMISSION_ROLES × PERMISSION_PAGE_CODES. Missing DB rows are 0000000.
```

checker 7줄 전수:

```text
  expect([...mockPageCodes].sort(), 'mock ↔ snapshot page-code catalog').toEqual([...snapshotPageCodes].sort())
  expect([...mockRoles].sort(), 'mock ↔ snapshot role catalog').toEqual([...snapshotRoles].sort())
 * Mock account endpoint와 auth_db role_page_permission_templates 스냅샷의
 * 역할 × page code × 7-action 전체 곱을 비교한다. 누락 셀도 0000000으로
 * 묵인하지 않고 page/role 집합 자체를 먼저 비교한다.
      expect(cell, `${role} × ${pageCode} cell`).toBeDefined()
      expect(actualBits, `${role} × ${pageCode}`).toBe(frozenDivergence?.mockBits ?? expectedBits)
```

### 3.2 실제 파일 적대 변이

각 변이는 runner 종료 직후 원바이트로 복원했다.

| # | 실제 변이 | 결과 |
|---:|---|---|
| G1 | generator `DB 파생 …` → valid-Unicode mojibake `DB ?뚯깮 …` | RED, 1 failed / 14 passed |
| G2 | generator `×` → `U+FFFD` | RED, 1 failed / 14 passed |
| G3 | checker `↔` → `→` | RED, 1 failed / 14 passed |
| G4 | checker `역할` → `役割` | RED, 1 failed / 14 passed |
| G5 | 생성 snapshot `×` → `…` | RED, 1 failed / 14 passed |
| G6 | 생성 snapshot에 새 비ASCII `Ω` 라인 추가 | RED, 1 failed / 14 passed |

복원 후 원문:

```text
Test Files  1 passed (1)
Tests       15 passed (15)
```

### 3.3 새 문자의 자동 적용성과 수동 유지보수 사실

판정은 다음 두 문장을 함께 봐야 한다.

- **자동 감지한다.** `nonAsciiLines(source)`가 파일 전체를 매번 다시 수집하므로 기존 라인의 새 문자, 새 비ASCII 라인, 새 문자 계열은 canonical 기대값과 달라 즉시 RED다. `Ω` 신규 추가를 실제로 넣어 RED를 확인했다.
- **정상으로 승인하는 목록 갱신은 수동이다.** 새 비ASCII가 의도된 변경이면 `canonicalNonAsciiLines` 기대 목록을 사람이 같은 PR에서 갱신해야 GREEN이 된다. 즉 자동 확장 allow가 아니라 fail-closed snapshot/allowlist다.

따라서 “새 문자가 조용히 검사 밖으로 빠지는” 구멍은 닫혔다. 다만 리뷰어가 원본 변경과 canonical 목록을 동시에 기계적으로 승인하면 다른 snapshot 테스트와 마찬가지로 우회될 수 있으므로, canonical 목록 갱신은 문자 의미를 확인하는 수동 리뷰 지점이다.

## 4. 세 번째 임무 — 9종 mutation 직접 RED

### 4.1 중복 5종

| # | 실제 변이 | 직접 원문 |
|---:|---|---|
| 1 | bucket snapshot ACCOUNTANT target을 `1000000`·`1110000`에 중복 | `duplicate snapshot cell ACCOUNTANT|accounting.sales-commission-settlement firstBits=1000000 secondBits=1110000`; 1 failed / 14 passed |
| 2 | TS DB snapshot MASTER target을 `0000000`·`1110000`에 중복 | `Duplicate key` + `duplicate projection cell MASTER|... firstBits=0000000 secondBits=1110000`; RED |
| 3 | 동일 TS 중복을 Java freshness parser가 직접 읽음 | `AccountingPermissionProjectionFreshnessIT.java:181`; 2 tests, 1 failed; BUILD FAILED |
| 4 | freshness DB query에 ACCOUNTANT/accounts 중복 row 추가 | `AccountingPermissionProjectionFreshnessIT.java:100`; 2 tests, 1 failed; BUILD FAILED |
| 5 | mock ACCOUNTANT edit source에 target 중복 | `mock role/page source must be duplicate-free`; 1 failed / 14 passed |

### 4.2 fix2 계열 4종

모두 `--rerun-tasks --no-daemon` fresh 실행이다.

| # | 실제 변이 | 직접 원문 |
|---:|---|---|
| 6 | V101 DRIVER 초과 grant | `SalesCommissionSettlementPermissionSeedTest.java:80`; 5 tests, 1 failed; BUILD FAILED |
| 7 | V101 ACCOUNTANT grant 누락 | `SalesCommissionSettlementPermissionSeedTest.java:80`; 5 tests, 1 failed; BUILD FAILED |
| 8 | V101 MASTER row 중복 | `SalesCommissionSettlementPermissionSeedTest.java:153`; 5 tests, 1 failed; BUILD FAILED |
| 9 | MASTER 중복 + DRIVER 초과 | `SalesCommissionSettlementPermissionSeedTest.java:153`; 5 tests, 1 failed; BUILD FAILED |

최종 원문:

```text
ALL_MUTATIONS_RED=9/9
```

복원 후 정상 구성:

```text
desktop exact contract: 15 tests / 15 passed
SalesCommissionSettlementPermissionSeedTest: tests=5 failures=0 errors=0 skipped=0
AccountingPermissionProjectionFreshnessIT: tests=2 failures=0 errors=0 skipped=0
BUILD SUCCESSFUL in 31s
```

복원 SHA-256:

- V101: `B173883CED1D2A54A0FE378285DA460D03011EDA110E409D42DCC7D2D1C12327`
- DB snapshot: `8AA5EB82337B18E02F5D3CB4694F9E7F8F0D7F76AF2292973471EE0AF37BCA2B`

## 5. PowerShell 5.1 RED-B

### 5.1 정상 2회 생성

```text
PS51_EXIT_1=0
PS51_EXIT_2=0
SHA_BEFORE=8AA5EB82337B18E02F5D3CB4694F9E7F8F0D7F76AF2292973471EE0AF37BCA2B
SHA_1=8AA5EB82337B18E02F5D3CB4694F9E7F8F0D7F76AF2292973471EE0AF37BCA2B
SHA_2=8AA5EB82337B18E02F5D3CB4694F9E7F8F0D7F76AF2292973471EE0AF37BCA2B
BYTES=15818
LF=413
CRLF=0
BOM=False
U_FFFD=0
```

### 5.2 중복 실패 진단

DB query 결과의 첫 row를 한 번 더 넣어 generator의 실제 fail-fast를 실행했다.

```text
FAIL_EXIT=1
FAIL_SHA_BEFORE=8AA5EB82337B18E02F5D3CB4694F9E7F8F0D7F76AF2292973471EE0AF37BCA2B
FAIL_SHA_AFTER=8AA5EB82337B18E02F5D3CB4694F9E7F8F0D7F76AF2292973471EE0AF37BCA2B
DB 파생 스냅샷 갱신 중단: duplicate projection cell ACCOUNTANT|accounting.accounts first/second bits cannot be represented
```

- 한글 정상
- exit 1
- PowerShell `At ...`, `CategoryInfo`, `FullyQualifiedErrorId` 스택 없음
- 실패 전후 output SHA 동일
- generator가 만든 임시 container/network 잔존 0

## 6. 직접 Playwright 라이브 QA

Codex 내장 브라우저 런타임은 사용하지 않았다. `clients/desktop`에서 Playwright를 직접 실행했다.

- 브라우저: `C:\Users\user\AppData\Local\ms-playwright\chromium-1217\chrome-win64\chrome.exe`
- headless: true
- renderer 전용 포트: `59911`
- 외부 API 격리 포트: `59999`
- 스펙: `playwright/dg1-s4a-sales-commission-settlement-real-qa/dg1-s4a-sales-commission-settlement-real-qa.spec.ts`
- 캡처 경로: 스펙의 `resolveQaShotsDir()` 경유

원문:

```text
Running 5 tests using 1 worker
[1/5] ACCOUNTANT: 회계 메뉴가 실제로 보이고 문서번호 클릭이 상세로 이동한다
[2/5] DRAFT 생성 후 확정하면 settlementDate 기준 문서번호가 채번된다
[3/5] 권한 없는 역할은 메뉴가 보이지 않고 직접 진입도 차단된다
[4/5] 전용 pageCode·REST 권한·7 action seed가 일치한다
[5/5] 회계 기존 메뉴 좌표가 보존된 채 정산 메뉴만 추가된다
5 passed (6.4s)
PLAYWRIGHT_EXIT=0
VITE_STOPPED=True
PORT_59911_LISTENERS=0
```

추가 RED-B 관통 스펙도 `resolveQaShotsDir()`를 사용해 실행한 뒤 삭제했다.

```text
Running 3 tests using 1 worker
[1/3] RED-B static counts stay 33 / 62
[2/3] RED-B MASTER opens every one of the previous 43 accounting routes
[3/3] RED-B list scroll restores 720 after native Link detail round-trip
3 passed (11.6s)
RED_B_PLAYWRIGHT_EXIT=0
VITE_STOPPED=True
PORT_59912_LISTENERS=0
```

중간 검증 스펙에서 두 종류의 false RED를 교정했다.

1. 정적 `SidebarLink`만 세어 다른 링크 컴포넌트를 누락한 카운터를 버리고 실제 DOM anchor 44개를 사용했다.
2. `locator.click()` 자동 스크롤이 저장 직전 720을 0으로 바꾸는 함정을 제거하고, native `A`임을 확인한 뒤 DOM click으로 왕복했다.

제품 코드 변경은 없었고 최종적으로 DOM 메뉴 44, 기존 route 43/43, scroll 720→720을 직접 확인했다.

## 7. RED-B 전체 결과

| 표면 | 직접 재검증 결과 |
|---|---|
| V101 정상 | seed 5/5 GREEN, 11역할 exact |
| SALES runtime deny | 직접 Playwright에서 메뉴 0·직접 route 차단 |
| accounting HTTP 403 | fresh 전체 suite의 `SalesCommissionSettlementHttpGuardIT` 1/1, failures/errors/skipped 0 |
| activeTargets | 33 entries / 33 unique / target 1 |
| 회계 렌더 메뉴 | 실제 DOM anchor 44 / unique 44 / target 1 |
| 권한 matrix 회계 그룹 | 62 entries / 62 unique / target 1 |
| 기존 route | MASTER 43/43 open, NotFound/login 0 |
| native Link + scroll | 실제 `A`, `720 → detail → back → 720` |
| desktop 전체 | 248 files, **2,167 passed / 1 skipped**, exit 0 |
| accounting 전체 fresh | 225 XML headers, **1,871 tests / failures 0 / errors 0 / skipped 10**, 21 tasks executed |

desktop 원문:

```text
Test Files  248 passed (248)
Tests       2167 passed | 1 skipped (2168)
Duration    413.22s
DESKTOP_EXIT=0
```

accounting 원문:

```text
BUILD SUCCESSFUL in 10m 10s
21 actionable tasks: 21 executed
ACCOUNTING_GRADLE_EXIT=0
ACCOUNTING_XML_FILES=225
ACCOUNTING_HEADERS=225
ACCOUNTING_TESTS=1871
ACCOUNTING_FAILURES=0
ACCOUNTING_ERRORS=0
ACCOUNTING_SKIPPED=10
```

## 8. 정리·복원 감사

- 전용 포트 `59911`, `59912`: listener 0
- 이 worktree의 Vite/Playwright용 Node server: 0
- generator가 만든 `accounting-permission-refresh-*` container: 0
- 이번 실행에서 새로 남은 refresh network: 0
- 2026-08-09 생성의 기존 미연결 network `accounting-permission-refresh-77c5a160cfc8`은 타 작업 소유라 건드리지 않았다.
- mutation harness와 RED-B 임시 Playwright 스펙: 삭제
- generator working blob과 HEAD blob: 모두 `cf66d49c1cd014299f37b9568c82244877cc609f`
- `git diff --check`: exit 0

## 9. 이 라운드가 보지 않은 표면

머지 판단에 포함하지 않은 표면을 명시한다.

1. 공유/운영 DB에 대한 생성·확정 write, 운영 배포 JAR, 운영 gateway/auth 연동은 실행하지 않았다. accounting HTTP 403은 격리된 테스트 HTTP 서버다.
2. 저장소 전체 548개 real-QA Playwright 시나리오를 일괄 실행하지 않았다. 이번 “전체 real-QA scope”는 Git 추적 집합/cleanup 계약 2+51개이며, 라이브 브라우저는 S4a 공식 5개와 RED-B 표적 3개를 실행했다.
3. Electron native shell, installer/update, 모바일 클라이언트, S4a 외 서비스 전체 suite는 실행하지 않았다.
4. 외부 vendor, 실제 회계 데이터, 실 사용자 권한 변경은 건드리지 않았다.

위 미검토 표면은 이번 fix6의 변경 좌표(UTF-8 contract test와 real-QA 경로 rename) 및 PR #1170 S4a 머지 게이트와 직접 연결된 회귀 표면 밖이다.

## 10. 결론

**BLOCKING 0 / MAJOR 0 / MINOR 0. PR #1170은 현 HEAD에서 머지 승인한다.**

