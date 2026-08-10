# PR #1151 CI red 수정 — 자격 안전 QA 스펙

작성일: 2026-08-09  
워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1142`  
HEAD 기준: `7323060b8`  
범위: QA Playwright 스펙 수집 단계 예외 방지. 제품 코드와 커밋된 QA 증거는 변경하지 않았다.

## 전수 grep

### 축 1 — `resolveQaCredential(` 모듈 스코프 호출

전수 명령 원문:

```powershell
rg -n -g '*.spec.ts' '^const [A-Z0-9_]+ = \(?resolveQaCredential|^const [A-Z0-9_]+ = .*resolveQaCredential' clients/desktop/playwright
```

전수 결과 요약 원문:

```text
MODULE_SCOPE_DECLARATION_MATCHES=136
ACTIVE_MODULE_SCOPE_RAW_MATCHES=0
```

136건은 모두 `*-real-qa` 경로/파일명의 라이브 QA 스펙이다. `playwright.config.ts`의 mock hard gate `testIgnore` 대상이므로 이번 CI 수집 범위에는 들어오지 않는다. 활성 범위에는 수정 전 `1151-postmerge-sol-reconv.spec.ts`가 있었고, 수정 후에는 모듈 스코프 선언 0건이다.

1151 대상 전수 grep 원문:

```text
clients/desktop/playwright\1151-final-reconv.spec.ts:79:    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
clients/desktop/playwright\1151-final-reconv.spec.ts:109:    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
clients/desktop/playwright\1151-final-reconv.spec.ts:171:    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
clients/desktop/playwright\1151-postmerge-sol-reconv.spec.ts:70:    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
clients/desktop/playwright\1151-postmerge-sol-reconv.spec.ts:102:    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
clients/desktop/playwright\1151-postmerge-sol-reconv.spec.ts:147:    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
clients/desktop/playwright\1151-final-sol-real-qa\1151-final-sol-real-qa.spec.ts:17:    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
```

명령:

```powershell
rg -n -g '1151*.spec.ts' 'resolveQaCredential\(' clients/desktop/playwright
```

결론: 세 커밋 스펙이 전부라는 전제는 **축 1 기준으로는 틀렸다**. 다른 커밋 스펙 136건이 있으나 모두 이번 mock CI 게이트에서 제외된 real-QA 스펙이다. 따라서 범위를 넓혀 수정하지 않았다.

### 축 2 — `resolveQaShotsDir()` 없이 `docs/qa/...` 목적지를 쓰는 스펙

전수 명령 원문:

```powershell
rg -n -g '*.spec.ts' 'path\.resolve\([^\n]*docs/qa/|path\.join\([^\n]*docs[\\/][\\/]?qa' clients/desktop/playwright | Where-Object { $_ -notmatch 'resolveQaShotsDir' }
```

전수 결과 요약 원문:

```text
DIRECT_PATH_RAW_MATCHES=12
```

raw grep 12건 중 11건은 real-QA 경로의 별도 스펙이며, 활성 mock 스펙의 실제 목적지 위반은 없었다. 1151 대상 grep 원문은 다음과 같다.

```text
clients/desktop/playwright\1151-postmerge-sol-reconv.spec.ts:10:const SHOTS = resolveQaShotsDir(path.resolve(process.cwd(), '../../docs/qa/1151-postmerge-sol-reconv'))
clients/desktop/playwright\1151-postmerge-mock-hardgate.spec.ts:7:const SHOTS = resolveQaShotsDir(path.resolve(process.cwd(), '../../docs/qa/1151-postmerge-sol-reconv'))
clients/desktop/playwright\1151-final-reconv.spec.ts:13:const SHOTS = resolveQaShotsDir(path.resolve(process.cwd(), '../../docs/qa/2026-08-09-1151-final-reconv'))
clients/desktop/playwright\1151-final-sol-real-qa\1151-final-sol-real-qa.spec.ts:10:const SHOTS = resolveQaShotsDir(
clients/desktop/playwright\1151-final-sol-real-qa\1151-final-sol-real-qa.spec.ts:11:  path.resolve(process.cwd(), '../../docs/qa/1151-final-sol-reconv'),
```

결론: 1151 대상은 모두 `resolveQaShotsDir()`를 경유한다. `1151-final-reconv.spec.ts`만 직접 경로였으므로 helper로 교정했다. `1151-postmerge-mock-hardgate.spec.ts`는 이미 두 규약을 만족해 내용 변경하지 않았다.

## 변경 대상

- `clients/desktop/playwright/1151-final-sol-real-qa/1151-final-sol-real-qa.spec.ts`
  - 자격 조회를 테스트 본문으로 이동.
  - `QA_CREDENTIAL_MISSING` 포함 예외는 해당 테스트만 `test.skip`.
- `clients/desktop/playwright/1151-postmerge-sol-reconv.spec.ts`
  - 모듈 스코프 `PASSWORD` 제거.
  - 세 테스트 본문에서 자격을 조회하고 무자격이면 skip.
  - 로그인 helper는 호출자가 전달한 password를 사용.
- `clients/desktop/playwright/1151-final-reconv.spec.ts` (기존 미추적 파일)
  - 동일한 본문 조회/skip 적용.
  - 캡처 경로를 `resolveQaShotsDir()`로 변경.
- `clients/desktop/playwright/1151-postmerge-mock-hardgate.spec.ts`
  - 변경 없음. 이미 안전한 상태임을 확인.

제품 코드(`SlipRealtimeClient.ts`, `createRealtimeClient.ts` 가드, inventory/slip backend)는 변경하지 않았다.

## RED/GREEN 원문

### RED-A — 무자격 수집

`.env.local` 파일은 존재 여부와 내용을 변경하지 않았다. `NODE_OPTIONS=--import=data:`로 프로세스 안에서 해당 파일의 `existsSync`만 false로 만들어 자격 파일 부재를 재현했다.

```text
RED-A: .env.local 파일 미변경, 프로세스 수준 credential 파일 조회 차단
Listing tests:
  [chromium] › 1151-postmerge-mock-hardgate.spec.ts:28:1 › 격리 API에서 입고 상세 mock handler가 실 Axios 탈출 없이 동작한다
  [chromium] › 1151-postmerge-sol-reconv.spec.ts:67:1 › MASTER 실 Desktop 입고 완료가 병합본 API를 호출한다
  [chromium] › 1151-postmerge-sol-reconv.spec.ts:99:1 › MANAGER 입고 완료는 journal 발화 경로를 거쳐 검수 완료까지 간다
  [chromium] › 1151-postmerge-sol-reconv.spec.ts:144:1 › SALES는 동일 입고 검수 완료를 GUI와 API 양쪽에서 차단당한다
Total: 4 tests in 2 files
EXIT_CODE=0
```

실행 단계까지 확인한 원문:

```text
Running 3 tests using 1 worker
3 skipped
RED-A EXECUTION EXIT_CODE=0
```

### RED-B — 자격 있는 로컬 실행

mock hard gate 실제 실행:

```text
[MOCK HARDGATE] VITE_API_BASE_URL=http://127.0.0.1:1 isolatedFailures=0
1 passed (5.8s)
RED-B mock hardgate EXIT_CODE=0
```

real-QA 스펙은 자격 조회까지는 통과했으나 현재 로컬 대상 전표가 이미 이전 QA에서 `INSPECTING` 상태로 소진되어 실제 버튼 단언에서 실패했다. 스펙/제품/DB를 되돌리거나 변경하지 않았다.

```text
Error: expect(locator).toBeVisible() failed
Locator: getByRole('button', { name: /입고 완료/ })
Page: 입고전표 상세 [2026/08/08-18]
현재 화면: 완료 (처리 완료), 검수 상태 검수 대기
RED-B real-QA EXIT_CODE=1
```

따라서 자격 있는 로컬에서 실제 통과한 것은 mock hard gate이며, 소진된 real-QA 대상의 재실행 통과는 확인하지 못했다. 기존 커밋 증거에 기록된 이전 real-QA 통과 원문은 덮어쓰지 않았다.

### RED-C — 하네스 거짓 green 가드

```text
✓ src/renderer/test-utils/harness-false-green-guard.test.ts (62 tests) 47047ms
Test Files  1 passed (1)
Tests       62 passed (62)
RED-C EXIT_CODE=0
```

### RED-D — QA 증거 무변경

```text
git diff --numstat -- 'docs/qa/**'
(출력 없음)
```

## 상태·신규 파일

```text
 M clients/desktop/playwright/1151-final-sol-real-qa/1151-final-sol-real-qa.spec.ts
 M clients/desktop/playwright/1151-postmerge-sol-reconv.spec.ts
?? clients/desktop/playwright/1151-final-reconv.spec.ts
?? docs/dev-reports/2026-08-09-1151-ci-safe-qa-specs.md
```

신규 생성 파일:

- `docs/dev-reports/2026-08-09-1151-ci-safe-qa-specs.md`

`clients/desktop/playwright/1151-final-reconv.spec.ts`는 작업 시작 전부터 미추적 상태였으며, PM 커밋 대상이라 목록에 함께 보고한다. 기존 무관 미추적 항목인 `clients/web/design-system/vite.config.ts.timestamp-1786257219189-390b01a4d6d3c.mjs`, `scratchpad/`는 건드리지 않았다.

커밋·push는 하지 않았다.

## 못 한 것

- 이미 `INSPECTING` 상태인 기존 real-QA 전표를 되돌려 real-QA 버튼 흐름을 재실행하는 작업은 하지 않았다. 이는 이번 CI safe-spec 수정 범위를 넘고 기존 QA 상태/증거를 훼손할 수 있다.
- 다른 136개 real-QA 스펙은 이번 mock hard gate의 수집 대상이 아니므로 수정하지 않았다.
