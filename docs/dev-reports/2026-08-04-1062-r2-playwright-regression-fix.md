# PR #1063 / 이슈 #1062 — 전표 라인 입력 UX Playwright 회귀 fix

> 작업일: 2026-08-04  
> 대상 브랜치: `fix/1062-line-input-ux`  
> 기준 HEAD: `cac258c3a`  
> CI run: `30793405443`

## 작업 범위

자동완성 `listbox` 미개방 2건과 360px·390px 옵션 박스에서 배지가 경계를 넘는 2건을 원인 조사하고, 모델명 자동완성 판독성·수정 모드 자동 빈행·UUID 미노출 불변식을 유지한 채 데스크톱 프런트만 수정한다.

## 진행 로그

### 0. 작업 시작

- 보고서 파일을 코드 조사 전에 생성했다.
- 사용자 지시대로 `git` 명령, 백엔드 변경, Docker 재빌드·서비스 재배포, 기존 스크린샷 삭제·갱신을 하지 않는다.
- RED 재현 결과와 GREEN 검증 결과는 실행 원문 그대로 뒤에 append 한다.

## RED 재현

### 실행 전 환경 오류

실행 명령:

```powershell
$env:VITE_MOCK_MODE='1'; $env:VITE_APP_VERSION='2026/08/04-1062-r2-red'; & '.\node_modules\.bin\playwright.cmd' test 'playwright/ac-2-product-autocomplete/ac-2-product-autocomplete.spec.ts' 'playwright/ac-b1b-ds-a11y-layout.spec.ts' --reporter=line
```

원문:

```text
Error: Process from config.webServer was not able to start. Exit code: 1

[WebServer] failed to load config from D:\dev\Samhan-Public\.claude\worktrees\w1062-lineux\clients\desktop\vite.config.ts
[WebServer] error when starting dev server:
Error: VITE_APP_VERSION는 YYYY/MM/DD-{번호} 형식이어야 합니다: 2026/08/04-1062-r2-red
```

위 실행은 스펙에 진입하지 않았으므로 회귀 RED로 집계하지 않는다.

### 회귀 RED 재현

실행 명령:

```powershell
$env:VITE_MOCK_MODE='1'; $env:VITE_APP_VERSION='2026/08/04-1062'; & '.\node_modules\.bin\playwright.cmd' test 'playwright/ac-2-product-autocomplete/ac-2-product-autocomplete.spec.ts' 'playwright/ac-b1b-ds-a11y-layout.spec.ts' --reporter=line
```

원문:

```text
Running 10 tests using 1 worker

[1/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:107:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 1: 전표 작성 진입 — 품목 combobox 렌더 확인
[2/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:120:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 2: "AJ" 입력 → 후보 listbox 표시 (mock /api/products?q=AJ)
  1) [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:120:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 2: "AJ" 입력 → 후보 listbox 표시 (mock /api/products?q=AJ) 

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('listbox', { name: '품목 목록' })
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" with timeout 5000ms
      - waiting for getByRole('listbox', { name: '품목 목록' })

      128 |     // listbox 결정적 대기 — debounce + 비동기 응답 완료까지 (F-05)
      129 |     const listbox = page.getByRole('listbox', { name: '품목 목록' })
    > 130 |     await expect(listbox).toBeVisible({ timeout: 5_000 })
          |                           ^
      131 | 
      132 |     // 후보 항목 중 AJ040 포함 확인
      133 |     await expect(listbox).toContainText('AJ040RXH4BC1')

[3/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:142:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 3: 후보 클릭 선택 → 입력란에 modelName 표시
[4/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:168:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 4: 키보드 ArrowDown + Enter 선택 → modelName 반영
  2) [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:168:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 4: 키보드 ArrowDown + Enter 선택 → modelName 반영 

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('listbox', { name: '품목 목록' })
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" with timeout 5000ms
      - waiting for getByRole('listbox', { name: '품목 목록' })

      175 |
      176 |     const listbox = page.getByRole('listbox', { name: '품목 목록' })
    > 177 |     await expect(listbox).toBeVisible({ timeout: 5_000 })
          |                           ^
      178 | 
      179 |     // ArrowDown → 첫 번째 항목 활성화
      180 |     await input.press('ArrowDown')

[5/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:195:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 5: 품목 선택 → 단가 자동 채워짐
[6/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:220:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 6: UUID 비공개 가드 — 전표작성 화면 UUID 미노출
  3) [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:220:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 6: UUID 비공개 가드 — 전표작성 화면 UUID 미노출 

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('listbox', { name: '품목 목록' })
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

    Call log:
      - Expect "toBeVisible" with timeout 5000ms
      - waiting for getByRole('listbox', { name: '품목 목록' })

      227 |
      228 |     const listbox = page.getByRole('listbox', { name: '품목 목록' })
    > 229 |     await expect(listbox).toBeVisible({ timeout: 5_000 })
          |                           ^
      230 |     // 실 후보 렌더 완료까지 결정적 대기 — "검색 중…" 로딩행도 role=option(id 없음)이라
      231 |     // 후보 도착 전에 id 를 수확하면 빈 id 로 false RED 가 난다.
      232 |     await expect(listbox).toContainText('AJ040RXH4BC1')

[7/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:266:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 7: 멀티라인 — 라인1·라인2 각각 독립 품목 선택 (per-instance seq)
[8/10] [chromium] › playwright\ac-b1b-ds-a11y-layout.spec.ts:53:3 › B1-B DS a11y/layout mock hard gate › SlipForm line table has no aria-required-parent violation
[9/10] [chromium] › playwright\ac-b1b-ds-a11y-layout.spec.ts:65:3 › B1-B DS a11y/layout mock hard gate › Partner/Product five match badges stay inside options at 360px and 390px
  4) [chromium] › playwright\ac-b1b-ds-a11y-layout.spec.ts:65:3 › B1-B DS a11y/layout mock hard gate › Partner/Product five match badges stay inside options at 360px and 390px 

    Error: 품목명 badge

    Error: expect(locator).toBeVisible() failed

    Locator: getByRole('listbox', { name: '품목 목록' }).getByRole('option').first().locator('[aria-label="매치 필드 품목명"]')
    Expected: visible
    Timeout: 5000ms
    Error: element(s) not found

      40 | async function expectBadgeInsideOption(option: Locator, badgeLabel: string): Promise<void> {
      41 |   const badge = option.locator(`[aria-label="매치 필드 ${badgeLabel}"]`)
    > 42 |   await expect(badge, `${badgeLabel} badge`).toBeVisible()
          |                                              ^
      43 |   const [optionBox, badgeBox] = await Promise.all([option.boundingBox(), badge.boundingBox()])
      44 |   expect(optionBox, `${badgeLabel} option bbox`).not.toBeNull()
      45 |   expect(badgeBox, `${badgeLabel} badge bbox`).not.toBeNull()

[10/10] [chromium] › playwright\ac-b1b-ds-a11y-layout.spec.ts:78:3 › B1-B DS a11y/layout mock hard gate › 1440px Partner/Product options preserve field exposure and separator order

  4 failed
    [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:120:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 2: "AJ" 입력 → 후보 listbox 표시 (mock /api/products?q=AJ) 
    [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:168:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 4: ArrowDown + Enter 선택 → modelName 반영 
    [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:220:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 6: UUID 비공개 가드 — 전표작성 화면 UUID 미노출 
    [chromium] › playwright\ac-b1b-ds-a11y-layout.spec.ts:65:3 › B1-B DS a11y/layout mock hard gate › Partner/Product five match badges stay inside options at 360px and 390px 

  6 passed (51.9s)
```

로컬 재현 결과는 4 failed이며, AC-2의 listbox 미개방 3개(시나리오 2·4·6)와 B1-B의 상품 배지 부재 1개로 나타났다. 사용자 CI의 4건(시나리오 4·6 및 360px·390px 경계 단언)과 표면은 동일하되, 로컬에서는 앞선 상품 목록 미개방 때문에 B1-B가 경계 단언까지 도달하지 않았다.

## 원인 가설 확정 및 1차 수정

### listbox 미개방 원인

`clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.tsx`가 `AsyncAutocomplete`에 `resultSelectionMode="single"`을 항상 전달하고 있었다. `AsyncAutocomplete.performSearch`는 `resultSelectionMode`가 있고 결과가 2건 이상이면 후보를 `selectionCandidates`로 옮긴 뒤 `closeSearchSurface()`를 호출하므로, `AJ`의 4건 검색 결과가 listbox가 아니라 `품목 검색 결과` 모달로만 렌더된다. RED의 페이지 스냅샷에도 이 모달이 확인됐다.

이 계약은 디자인 시스템 기본 사용처에서 유지해야 하므로, `ProductAutocomplete`에 `resultSelectionMode` override를 추가하고 기본값은 기존 `'single'`로 보존했다. `SlipFormPage`의 두 제품 자동완성 인스턴스만 `resultSelectionMode={null}`을 전달해 전표작성 화면에서는 모델명·품목명 매치 배지가 있는 인라인 listbox와 ArrowDown/Enter 경로를 사용하도록 했다. UUID는 계속 `ProductOption.id` payload 전용이며 option DOM id는 기존 opaque index 형식을 유지한다.

### 1차 수정 파일

- `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.tsx`
- `clients/desktop/src/renderer/routes/SlipFormPage.tsx`
- 위 소스 변경을 반영하기 위해 `clients/web/design-system/dist/`를 `npm run build`로 재생성했다.

### 1차 빌드 원문

```text
> @samhan/design-system@0.1.0 build
> tsc -p tsconfig.build.json && vite build

vite v5.4.21 building for production...
transforming...
✓ 163 modules transformed.
rendering chunks...
[vite:dts] Start generate declaration files...
dist/style.css  94.75 kB │ gzip: 15.32 kB
dist/index.js   312.89 kB │ gzip: 149.09 kB
[vite:dts] Start rollup declaration files...
Analysis will use the bundled TypeScript version 5.9.3
[vite:dts] Declaration files built in 5461ms.
✓ built in 6.35s

/fonts/PretendardVariable.woff2 referenced in /fonts/PretendardVariable.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime
/fonts/Pretendard-Regular.woff2 referenced in /fonts/Pretendard-Regular.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime
/fonts/Pretendard-Bold.woff2 referenced in /fonts/Pretendard-Bold.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime
```

## DEBUG REPORT

- Symptom: PR #1063의 전표작성 자동완성 mock 회귀 4건.
- Root cause: 전표 화면에서 다중 후보를 선택 모달로 전환해 listbox를 닫았고, 좁은 option의 nowrap/shrink 불가 CSS가 배지 경계 이탈을 허용했다.
- Fix: 전표 화면에만 inline listbox override를 적용하고, 공통 option을 좁은 폭에서 wrap/shrink/ellipsis하도록 수정했다.
- Evidence: 동일 Playwright 명령 10/10, 디자인 시스템 24/24, SlipFormPage 58/58, desktop typecheck 종료 코드 0.
- Regression test: `playwright/ac-2-product-autocomplete/ac-2-product-autocomplete.spec.ts`, `playwright/ac-b1b-ds-a11y-layout.spec.ts` 기존 스펙을 수정하지 않고 GREEN 검증.
- Related: 전체 desktop mock 스위트는 240초 timeout으로 미판정.
- Status: `DONE_WITH_CONCERNS` — 대상 회귀는 GREEN이나 전체 mock 모음과 CI Linux line 48 수치는 이 라운드에서 완주·독립 재현하지 못했다.

## 1차 수정 후 재검증

RED와 동일한 `clients/desktop` cwd 및 `node_modules/.bin/playwright.cmd` 바이너리로 동일한 두 스펙을 실행했다.

실행 명령:

```powershell
$env:VITE_MOCK_MODE='1'; $env:VITE_APP_VERSION='2026/08/04-1062'; & '.\node_modules\.bin\playwright.cmd' test 'playwright/ac-2-product-autocomplete/ac-2-product-autocomplete.spec.ts' 'playwright/ac-b1b-ds-a11y-layout.spec.ts' --reporter=line
```

GREEN 원문:

```text
Running 10 tests using 1 worker

[1/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:107:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 1: 전표 작성 진입 — 품목 combobox 렌더 확인
[2/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:120:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 2: "AJ" 입력 → 후보 listbox 표시 (mock /api/products?q=AJ)
[3/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:142:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 3: 후보 클릭 선택 → 입력란에 modelName 표시
[4/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:168:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 4: 키보드 ArrowDown + Enter 선택 → modelName 반영
[5/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:195:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 5: 품목 선택 → 단가 자동 채워짐
[6/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:220:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 6: UUID 비공개 가드 — 전표작성 화면 UUID 미노출
[7/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:266:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 7: 멀티라인 — 라인1·라인2 각각 독립 품목 선택 (per-instance seq)
[8/10] [chromium] › playwright\ac-b1b-ds-a11y-layout.spec.ts:53:3 › B1-B DS a11y/layout mock hard gate › SlipForm line table has no aria-required-parent violation
[9/10] [chromium] › playwright\ac-b1b-ds-a11y-layout.spec.ts:65:3 › B1-B DS a11y/layout mock hard gate › Partner/Product five match badges stay inside options at 360px and 390px
[10/10] [chromium] › playwright\ac-b1b-ds-a11y-layout.spec.ts:78:3 › B1-B DS a11y/layout mock hard gate › 1440px Partner/Product options preserve field exposure and separator order
[1A][2K  10 passed (25.3s)
```

이 실행에서 360px·390px 배지 경계 단언까지 포함해 B1-B 전체가 통과했다. RED 실행에서는 상품 검색이 모달로 전환되어 해당 경계 단언에 도달하지 못했으므로, CI가 보고한 line 48의 수치 초과 자체는 로컬에서 독립 재현하지 못했다. 동일한 surface를 listbox로 복원한 뒤에는 동일 두 폭의 실제 bounding-box 단언이 GREEN이므로, 이 라운드에서 별도 timeout/EPSILON/test 단언 완화나 CSS 수정을 하지 않았다.

## 후속 회귀 검증

### 디자인 시스템 자동완성 계약

실행 명령:

```powershell
npm test -- --run src/components/ProductAutocomplete/ProductAutocomplete.test.tsx src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx
```

원문:

```text
> @samhan/design-system@0.1.0 test
> vitest run --run src/components/ProductAutocomplete/ProductAutocomplete.test.tsx src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx

RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1062-lineux/clients/web/design-system

✓ src/components/ProductAutocomplete/ProductAutocomplete.test.tsx (6 tests) 444ms
✓ src/components/AsyncAutocomplete/AsyncAutocomplete.test.tsx (18 tests) 816ms
  ✓ AsyncAutocomplete > 모달 취소 직후 검색어는 남지만 필드 왕복 후에는 정리된다 362ms

Test Files  2 passed (2)
Tests       24 passed (24)
Start at    09:55:31
Duration    4.11s (transform 492ms, setup 913ms, collect 978ms, tests 1.26s, environment 3.26s, prepare 287ms)
```

기본 `ProductAutocomplete`의 2건 이상 결과 모달 계약이 유지됨을 확인했다.

### SlipFormPage 단위 회귀

실행 명령:

```powershell
npm test -- --run src/renderer/routes/SlipFormPage.test.tsx
```

원문:

```text
> @samhan/desktop@0.1.0 pretest
> node scripts/real-qa-scope.cjs --phase=test

[로컬 파생물 신선도] test 대상 확인 완료 — 이 확인은 design-system dist 최신성 · electron-updater 설치 버전 일치 · Electron out/main 빌드 최신성만 봅니다. node_modules 의 file: 링크 무결성이나 그 외 일반 의존성 상태는 다루지 않으며, 그런 문제는 이어지는 tsc/vitest 원본 오류로 드러납니다.

> @samhan/desktop@0.1.0 test
> vitest run --run src/renderer/routes/SlipFormPage.test.tsx

RUN  v2.1.9 D:/dev/Samhan-Public/.claude/worktrees/w1062-lineux/clients/desktop

✓ src/renderer/routes/SlipFormPage.test.tsx (58 tests) 2506ms

Test Files  1 passed (1)
Tests       58 passed (58)
Start at    09:55:32
Duration    5.98s (transform 472ms, setup 0ms, collect 1.29s, tests 2.51s, environment 1.35s, prepare 152ms)

stderr:
React Router Future Flag Warning: React Router will begin wrapping state updates in React.startTransition in v7.
React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7.
```

## 전체 범위 확인 시도

기존 다른 mock 스펙의 회귀 여부를 확인하기 위해 전체 desktop Playwright mock 스위트를 같은 `clients/desktop` cwd 및 로컬 바이너리로 실행했다. 240초 안에 종료되지 않아 완료 판정은 하지 않는다.

실행 명령:

```powershell
$env:VITE_MOCK_MODE='1'; $env:VITE_APP_VERSION='2026/08/04-1062'; & '.\node_modules\.bin\playwright.cmd' test --reporter=line
```

원문:

```text
command timed out after 244029 milliseconds
```

이 시도는 대상 2개 스펙의 결과를 덮어쓰지 않으며, 전체 모음의 완료/회귀 여부는 미판정이다.

## 타입 검사

실행 명령:

```powershell
npm run typecheck
```

결과 원문 중 전체 결과:

```text
> @samhan/desktop@0.1.0 typecheck
> node scripts/real-qa-scope.cjs --phase=typecheck && tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit && npm run typecheck:real-qa

> @samhan/desktop@0.1.0 typecheck:real-qa
> node --test scripts/real-qa-cleanup-scope.test.cjs && node --test scripts/real-qa-scope.test.cjs

✔ real-QA 공식 수집 집합은 현재 Git 추적 집합과 이름 단위로 일치한다(.gitignore 가 허용한 로컬 스펙은 예외) (1122.0612ms)
✔ F-2: .gitignore 등재 경로 안의 추적 스펙 2개가 공식 집합에 남는다 (1068.5204ms)
✔ 결함6 참고: 구 assert.equal 방식은 추적 스펙이 늘기만 해도 실패했다(합성 173 vs 172, 고정 실측) (1.3157ms)
✔ 결함1: REAL_QA_ALLOW_UNTRACKED 세션 잔존은 명시 경로 없는 전체 실행을 오염시키지 않는다 (3865.663ms)
✔ F-1 RED: playwright/ 전체 위치 인자는 남은 ALLOW_UNTRACKED 로 우회되지 않는다 (3444.9498ms)
✔ 결함1 핵심: 집합이 깨끗해도 명시 경로 없는 real-QA 전체 실행은 차단한다 (0.338ms)
✔ F-1·F-2 및 재수렴 회귀 검증 50건 전체 통과
```

타입스크립트 `tsconfig.node.json`·`tsconfig.web.json` 검사와 real-QA scope 테스트가 종료 코드 0으로 완료됐다. 출력에 표시된 real-QA 추적 집합 메시지와 CRLF 경고는 기존 로컬 스코프 검사 출력이며 이번 변경 파일과 무관하다.

## 원인 및 수정

최종 원인은 아래 `최종 원인 및 실패별 해소` 절에 정리했다.

## GREEN 검증

동일 명령으로 최종 수정 후 10/10 GREEN. 원문은 아래 `최종 GREEN 재검증` 절에 보존했다.

## 이 라운드가 보지 않은 것

- 전체 desktop mock 스위트는 240초 timeout으로 완료되지 않아 전체 모음의 최종 통과 여부를 보지 못했다.
- CI Linux 환경의 실제 폰트/브라우저에서 보고된 line 48 경계 초과 수치는 로컬 Windows Chromium에서 독립 재현하지 못했다.
- 백엔드, 실서버/실 DB, Docker 재빌드·재배포, real-QA는 이 라운드 범위가 아니어서 보지 않았다.
- CI run `30793405443` 재실행과 PR 머지는 하지 않았다.

## 신규 파일

- `docs/dev-reports/2026-08-04-1062-r2-playwright-regression-fix.md` (본 보고서)

## 최종 원인 및 실패별 해소

### ① `ac-2` Enter 선택 listbox 미개방

- 원인: 전표 화면의 `ProductAutocomplete`이 `resultSelectionMode="single"`을 공통 컴포넌트에 전달했다. `AJ` 검색은 4건이라 `AsyncAutocomplete`의 2건 이상 결과 모달 분기로 빠지고 listbox를 닫았다.
- 수정: `ProductAutocomplete`은 기본 `'single'` 모달 계약을 보존하되 `null` override를 허용했다. `SlipFormPage`의 모바일·데스크톱 두 인스턴스에 `resultSelectionMode={null}`을 전달해 후보를 인라인 listbox로 유지했다. ArrowDown/Enter는 기존 `AsyncAutocomplete` 선택 경로를 그대로 사용한다.

### ② `ac-2` UUID 비공개 가드 listbox 미개방

- 원인: ①과 동일한 모달 전환이다. 따라서 `listbox`가 없어서 UUID/opaque option id 검사가 시작되기 전에 timeout 났다.
- 수정: 같은 전표 전용 dropdown override로 listbox를 열었다. option DOM id는 기존 `${listId}-opt-${idx}`를 유지하고 `ProductOption.id` UUID는 계속 payload/state 전용이므로 UUID 비공개 가드를 변경하지 않았다.

### ③④ `ac-b1b` 360px·390px 배지 경계 초과

- 원인: 좁은 viewport에서 dropdown 자체는 `max-width: min(640px, calc(100vw - 16px))`로 제한되지만, option은 `white-space: nowrap`이고 매치 필드 텍스트가 `flex: 0 0 auto`여서 긴 후보의 텍스트+배지가 option 폭을 밀어낼 수 있는 구조였다. RED에서는 앞선 모달 전환 때문에 로컬 상품 경로가 line 48까지 독립 도달하지 않아 CI의 수치 초과를 그대로 재현하지 못했다.
- 수정: `AsyncAutocomplete.module.css`의 option을 `flex-wrap: wrap`, `box-sizing: border-box`, `min/max-width` 제한으로 바꾸고, 보조 필드를 shrink 가능하게 했다. 매치 텍스트는 `min-width: 0` + ellipsis로 줄어들며 배지는 option 내부에 남는다. 1440px에서는 내용이 충분해 기존 한 줄·필드 순서를 유지한다.

### C. 모델명 판독성과 수정 모드 자동 빈행

`ProductAutocomplete`의 모델명 우선 렌더링과 매치 배지는 유지했다. `SlipFormPage`의 자동 빈행 로직은 변경하지 않았고 `SlipFormPage.test.tsx` 58건이 통과했다.

## 최종 GREEN 재검증

실행 명령:

```powershell
$env:VITE_MOCK_MODE='1'; $env:VITE_APP_VERSION='2026/08/04-1062'; & '.\node_modules\.bin\playwright.cmd' test 'playwright/ac-2-product-autocomplete/ac-2-product-autocomplete.spec.ts' 'playwright/ac-b1b-ds-a11y-layout.spec.ts' --reporter=line
```

원문:

```text
Running 10 tests using 1 worker

[1A[2K[1/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:107:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 1: 전표 작성 진입 — 품목 combobox 렌더 확인
[1A[2K[2/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:120:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 2: "AJ" 입력 → 후보 listbox 표시 (mock /api/products?q=AJ)
[1A[2K[3/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:142:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 3: 후보 클릭 선택 → 입력란에 modelName 표시
[1A[2K[4/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:168:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 4: 키보드 ArrowDown + Enter 선택 → modelName 반영
[1A[2K[5/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:195:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 5: 품목 선택 → 단가 자동 채워짐
[1A[2K[6/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:220:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 6: UUID 비공개 가드 — 전표작성 화면 UUID 미노출
[1A[2K[7/10] [chromium] › playwright\ac-2-product-autocomplete\ac-2-product-autocomplete.spec.ts:266:3 › AC-2 품목 자동완성 ProductAutocomplete › 시나리오 7: 멀티라인 — 라인1·라인2 각각 독립 품목 선택 (per-instance seq)
[1A[2K[8/10] [chromium] › playwright\ac-b1b-ds-a11y-layout.spec.ts:53:3 › B1-B DS a11y/layout mock hard gate › SlipForm line table has no aria-required-parent violation
[1A[2K[9/10] [chromium] › playwright\ac-b1b-ds-a11y-layout.spec.ts:65:3 › B1-B DS a11y/layout mock hard gate › Partner/Product five match badges stay inside options at 360px and 390px
[1A[2K[10/10] [chromium] › playwright\ac-b1b-ds-a11y-layout.spec.ts:78:3 › B1-B DS a11y/layout mock hard gate › 1440px Partner/Product options preserve field exposure and separator order
[1A[2K  10 passed (24.0s)
```

## 변경 파일

- `clients/desktop/src/renderer/routes/SlipFormPage.tsx`
- `clients/web/design-system/src/components/ProductAutocomplete/ProductAutocomplete.tsx`
- `clients/web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.module.css`
- `clients/web/design-system/dist/index.js`
- `clients/web/design-system/dist/index.d.ts`
- `clients/web/design-system/dist/style.css`
- `docs/dev-reports/2026-08-04-1062-r2-playwright-regression-fix.md`

Playwright RED 실행이 만든 로컬 진단 산출물은 `clients/desktop/test-results/**` 아래에 있으며, 기존 `docs/qa/**` 및 `clients/desktop/playwright/**/screenshots/**` 캡처는 삭제·갱신하지 않았다.

## 최종 디자인 시스템 빌드 원문

CSS 보강과 `ProductAutocomplete` override를 포함한 dist 재생성 결과:

```text
> @samhan/design-system@0.1.0 build
> tsc -p tsconfig.build.json && vite build

vite v5.4.21 building for production...
transforming...
✓ 163 modules transformed.
rendering chunks...
[vite:dts] Start generate declaration files...
dist/style.css  94.87 kB │ gzip: 15.33 kB
dist/index.js   312.89 kB │ gzip: 149.10 kB
[vite:dts] Start rollup declaration files...
Analysis will use the bundled TypeScript version 5.9.3
[vite:dts] Declaration files built in 4433ms.
✓ built in 5.29s

/fonts/PretendardVariable.woff2 referenced in /fonts/PretendardVariable.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime
/fonts/Pretendard-Regular.woff2 referenced in /fonts/Pretendard-Regular.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime
/fonts/Pretendard-Bold.woff2 referenced in /fonts/Pretendard-Bold.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime
```
