# #964 — 공유 real-QA 설정이 gitignore 스펙까지 수집 (기획)

> **작성** 2026-07-28 · OPUS 기획 · 브랜치 `chore/964-real-qa-testmatch-scope` (main `40c415426` 기준)
> **연관** #964 · #851 · #949 · #951 · #952
>
> 🚫 이 문서는 **불변식과 울타리**만 정한다. 구현 수단(어떤 API·어떤 파일·어떤 방식)은 지정하지 않는다.
> 구현자가 수단을 고르고, 그 수단이 만든 결함은 구현자가 책임진다.
> ([[feedback_canonical_workflow]] — "PM 은 fix 지시에서 불변식만 말하고 구현 수단을 지시하지 않는다")

---

## 0. 요약

공유 real-QA 하네스(`clients/desktop/playwright.real-qa.config.ts`)의 `testMatch` 는 **디스크를 검색**하므로
Git 추적 여부와 무관하게 스펙을 수집한다. 그 결과 **같은 커밋에서 실행자마다 다른 테스트 집합**이 돌고,
실행자에게는 **아무 신호도 없다**.

이 PC(회사 PC)에서 **결함 A 의 증상은 재현되지 않았고**(로컬에 문제의 디렉터리가 없음),
**메커니즘은 주입 실험으로 재현됐다**. 결함 B 는 **증상은 그대로 재현됐으나 이슈가 적은 원인은 이 PC 에서 틀렸다**.
아래 §1 에 전부 수치 원문으로 기록한다.

---

## 1. 진단 — 이 PC 실측 (정직 기록)

측정 환경: `D:\dev\Samhan-Public` (실제 QA 작업 디렉터리) · `HEAD = 40c415426` · `git status` **완전 clean** ·
`clients/desktop/playwright.real-qa.config.ts` 는 `40c415426` 과 **바이트 동일**(diff 0).

### 1-1. 결함 A — **증상 미재현 / 메커니즘 재현**

| 측정 | 이 PC (회사 PC) | 이슈 기재 (집 PC) | 판정 |
|---|---|---|---|
| 공유 하네스 수집(전체) | **`Total: 548 tests in 172 files`** | `558 tests in 176 files` | ❌ 증상 미재현 |
| 공유 하네스 수집(`--project=renderer`) | **`Total: 547 tests in 171 files`** | `557 tests in 175 files` | ❌ 증상 미재현 |
| 디스크상 `*-real-qa.spec.ts` | **172** | 176 | — |
| Git 추적 `*-real-qa.spec.ts` | **172** | 172 | — |
| 디스크 − 추적 차집합 | **0건** | 4파일 · 10테스트 | ❌ 증상 미재현 |

**왜 미재현인가** — 이슈가 지목한 4개 디렉터리 중 이 PC 에 존재하는 것이 **0개**다:

```text
absent: playwright/coedit-s3-3-accounting
absent: playwright/n1b-native-qa
absent: playwright/n3b-fcm-push-real-qa
absent: playwright/e2-partner-list-real-qa
```

⟹ **결함은 "코드가 항상 틀렸다" 가 아니라 "결과가 PC 마다 다르다" 이고, 이 PC 는 마침 깨끗한 쪽이다.**
이것이 결함의 본체를 오히려 강화한다 — 같은 커밋·같은 명령이 두 PC 에서 다른 수를 낸다.

### 1-2. 메커니즘은 이 PC 에서 **재현됐다** (주입 실험)

`.gitignore` 대상 디렉터리에 미추적 스펙 1개를 만들고 재수집했다.

```text
[주입]  clients/desktop/playwright/n1b-native-qa/zzz-diag964-real-qa.spec.ts  (테스트 1개)

[git status --porcelain]
(빈 출력 — 완전 clean)

[git check-ignore -v]
.gitignore:93:clients/desktop/playwright/n1b-native-qa/	clients/desktop/playwright/n1b-native-qa/zzz-diag964-real-qa.spec.ts

[playwright --list]
  [renderer] › n1b-native-qa\zzz-diag964-real-qa.spec.ts:2:1 › DIAG964 untracked local spec - collection probe
Total: 549 tests in 173 files
```

**548/172 → 549/173.** 그 사이 `git status` 는 **한 글자도 변하지 않았다.**
⟹ **Git 은 이 오염을 볼 수 없고, 하네스도 알리지 않는다.** 실행자가 알 방법이 현재 0개다.
(주입 파일은 실험 직후 삭제, 디렉터리까지 제거, `git status` 재확인 clean.)

### 1-3. 🚩 이슈 표현 정정 ① — **CI 는 이 집합을 한 번도 실행하지 않는다**

이슈와 제목은 *"로컬 실행이 CI 와 다른 집합"* 이라고 적지만, **CI 에는 대조 상대가 없다**:

```text
$ grep -rniE 'real-qa|real_qa|realqa' .github/workflows/
(매치 0건)
```

`.github/workflows/` 전체에서 `real-qa` 매치가 **0건**이다. CI 가 데스크톱에서 실행하는 Playwright 는
`qa-e2e.yml` 의 `desktop-playwright` 잡이고 그것은 **기본 config(`playwright.config.ts`) = mock 회귀 게이트**다.
그 config 는 `testIgnore` 로 `**/*-real-qa.spec.ts` · `**/*-real-qa/**` 를 **제외**한다 —
즉 공유 real-QA 집합은 **설계상 CI 밖**이다. (#851 R1 도 같은 것을 관측해 기록해 뒀다:
`docs/superpowers/plans/2026-07-27-851-gate-gaps.md` V-3 — *"typecheck·lint·CI 실행 어디에도 걸리지 않는다"*.)

⟹ **정정된 결함 진술**: 로컬 실행 집합이 어긋나는 상대는 CI 가 아니라
**Git 추적 집합** — 즉 *다른 실행자·다른 PC·리뷰 보고서가 인용하는 기준 집합*이다.
이 구분은 중요하다. "CI 와 맞춘다" 를 목표로 삼으면 **맞출 대상이 없어** 헛 fix 가 된다.

### 1-4. 🚩🚩 지뢰 — `.gitignore` 를 그대로 배제 기준으로 쓰면 **추적 스펙 2개가 사라진다**

`.gitignore:89~95` 는 7개 디렉터리를 무시 대상으로 적는다. 그런데 그중 **2개는 추적 파일을 품고 있다**:

```text
$ git ls-files clients/desktop/playwright/manual clients/desktop/playwright/dispatch-collab-real-qa
clients/desktop/playwright/dispatch-collab-real-qa/dispatch-collab-codex-round.spec.ts
clients/desktop/playwright/dispatch-collab-real-qa/dispatch-collab-real-qa.spec.ts
clients/desktop/playwright/dispatch-collab-real-qa/kst-verification.spec.ts
clients/desktop/playwright/dispatch-collab-real-qa/playwright.config.ts
clients/desktop/playwright/manual/e3-s1-cash-receipt-permission-qa.config.ts
clients/desktop/playwright/manual/e3-s1-cash-receipt-permission-qa.spec.ts
clients/desktop/playwright/manual/manual-capture.spec.ts
clients/desktop/playwright/manual/slip-form-3d-real-qa.spec.ts
clients/desktop/playwright/manual/slip-rename.spec.ts
```

그리고 그중 **2개는 현재 548 집합 안에 실제로 들어 있다**:

```text
[renderer] › dispatch-collab-real-qa\dispatch-collab-real-qa.spec.ts:87:3 › §7 슬라이스4 배차 협업 실 QA — 수정완료 1-인 모델 › 이력 → 상세 모달 → 수정완료(비고) → diff
[renderer] › manual\slip-form-3d-real-qa.spec.ts:41:1 › item 3-D: SlipFormPage 재고조회 → 신 InventoryLookupModal 실 서버 연동 (값 0=시드 드리프트)
```

**판정 도구를 잘못 고르면 결과가 뒤집힌다** — 같은 경로에 대해 `git check-ignore` 가 두 답을 준다:

```text
[기본 — index 참조]                     [--no-index — 규칙만]
manual                   (무시 아님)     manual                   .gitignore:89
dispatch-collab-real-qa  (무시 아님)     dispatch-collab-real-qa  .gitignore:92
coedit-s3-3-accounting   .gitignore:91   coedit-s3-3-accounting   .gitignore:91
n1b-native-qa            .gitignore:93   n1b-native-qa            .gitignore:93
n3b-fcm-push-real-qa     .gitignore:94   n3b-fcm-push-real-qa     .gitignore:94
e2-partner-list-real-qa  .gitignore:95   e2-partner-list-real-qa  .gitignore:95
```

⟹ **"`.gitignore` 에 적힌 디렉터리를 제외한다" 식 구현은 추적 스펙 2개를 게이트에서 조용히 지운다.**
이 레포의 전형적 사고가 정확히 이것이다 — 아래 §5 F-2 를 울타리로 명문화한다.

**전례(같은 파일·같은 축)**: `#864` 가 이 공유 config 의 `testMatch` 를 좁혀 **82 스펙을 무력화**했는데
`assert-playwright-ran.mjs` 에 하한이 없어 통과했다([[feedback_ci_test_filter_false_green]] 말미).
`playwright.real-qa.config.ts:7~13` 헤더 주석에도 같은 사고가 한 번 더 기록돼 있다
(*"R2 가 testMatch 를 이 슬라이스 스펙 1개로 좁혀 repo 전체 real-QA 스펙을 무력화했었다"*).
**이 파일에서 범위를 좁히는 변경은 이 레포에서 두 번 사고를 냈다.**

### 1-5. 결함 B — **증상 재현 / 이슈가 적은 원인은 이 PC 에서 틀렸다**

이슈는 *"로컬 `node_modules` 에 `electron-updater` 가 없어서"* 라고 적었다. **이 PC 는 설치돼 있다**:

```text
package.json:44   "electron-updater": "^6.8.9",
node_modules/electron-updater      (존재)
installed version: 6.8.9
```

그런데 **이슈가 인용한 그 단언이 이 PC 에서도 똑같이 실패한다**:

```text
 ❯ src/main/build-output-cjs-interop.test.ts (1 test | 1 failed)
   × main 산출물 ESM/CJS named-import 상호운용 회귀 가드 (#909, mock 없음)
     → expected [ 'electron-store' ] to include 'electron-updater'
```

**진짜 원인** — 그 테스트는 `node_modules` 가 아니라 **빌드 산출물** `out/main/index.js` 를 읽는다
(`build-output-cjs-interop.test.ts:39`). 이 PC 의 산출물이 **13일 낡았다**:

```text
-rw-r--r-- 1 ewoo2 197610 7041 Jul 15 16:27 out/main/index.js      ← 2026-07-15 빌드
b9447b414 2026-07-26 01:22:24 +0900 [FIX] 데스크톱 main 이 기동하지 않던 ESM/CJS 상호운용 회귀 + 게이트 신설 (#931)
                                     ↑ electron-updater import 가 src/main 에 들어온 시점

[stale 산출물이 실제로 담고 있는 외부 import]
1:import { safeStorage, ipcMain, app, shell, BrowserWindow } from "electron";
4:import Store from "electron-store";
```

**같은 계열 2번째 실측 — `npm run typecheck` 도 이 PC 에서 RED 인데, 이슈와 다른 에러다**:

```text
src/renderer/routes/dispatch-board/components/SlipDetailModal.tsx(62,7): error TS2322: ...
  Property 'printableBody' does not exist on type 'IntrinsicAttributes & ModalProps'.
src/renderer/routes/SlipFormPage.tsx(532,9): error TS2322: ...
  Property 'excludedFromSave' does not exist on type 'IntrinsicAttributes & LineRowProps & RefAttributes<HTMLDivElement>'.
```

원인은 코드가 아니라 **`file:` 의존 `@samhan/design-system` 의 stale 빌드**다
(`node_modules/@samhan/design-system` → `clients/web/design-system` 심볼릭 링크, 타입은 `dist` 에서 옴):

```text
-rw-r--r-- 1 ewoo2 197610 102307 Jul 23 09:51 clients/web/design-system/dist/index.d.ts   ← 2026-07-23 빌드
a6b5e88c2 2026-07-24 15:39:40 +0900 [CHORE] 문서 모달 인쇄 시 배경 본문 차폐 (배차보드 전표 상세) (#921)
                                     ↑ printableBody 가 소스에 들어온 시점
소스에는 있다:  design-system/src/components/Modal/Modal.tsx:47  printableBody?: boolean
dist 에는 없다: grep -rln printableBody dist/ → 0건
```

**CI 가 왜 green 인가** — `ci.yml` `frontend-desktop` 잡이 **매번 순서대로 다시 만들기 때문이다**:
design-system `npm ci && npm run build` → desktop `npm ci` → `typecheck` → `lint` → **`build`** → `build:web`
→ `build:capacitor` → **`npm test`**. 로컬에는 이 순서를 강제하는 것이 **아무것도 없다.**

⟹ **결함 B 의 재정의**: *"electron-updater 가 안 깔렸다"* 가 아니라
**"로컬 검증 명령의 결과가 파생물(설치된 node_modules · `file:` 의존 `dist` · `out/` 빌드 산출물)의
신선도에 좌우되고, 낡았을 때 나오는 메시지가 '네 코드가 틀렸다' 처럼 보인다"** 이다.
이 PC 한 대에서만 **파생물 2종이 동시에 stale** 이었고, 집 PC 는 **3종째(node_modules)** 였다.
이건 한 PC 의 사고가 아니라 **구조**다.

### 1-6. 오염되지 **않은** 표면 (대조군 — 이 PC 실측)

같은 계열을 의심할 수 있는 다른 수집기는 이 PC 에서 **깨끗했다**. 범위를 넓히지 않기 위해 기록한다.

| 수집기 | 이 PC 수집 | 추적 집합과 차이 |
|---|---|---|
| mock 게이트 `playwright.config.ts` | `Total: 652 tests in 117 files` | **0건** (117파일 전부 추적) |
| `vitest` (`src/**/*.test.ts(x)`) | `1648 tests / 179 files` | **0건** (179파일 전부 추적) |

⟹ 이 슬라이스의 표면은 **공유 real-QA 하네스 1개**로 좁혀도 된다.
(#951 이 관측한 `1648` vs 보고서 `1643` 은 이 PC 에서 **미추적 파일 때문이 아니다** — 확증하지 못했다. §7 참조.)

---

## 2. 불변식 — *"무엇이 참이어야 하는가"*

🚫 **구현 수단 미지정.** 아래는 전부 "무엇" 이며 "어떻게" 가 아니다.

### I-1. 실행자는 자기가 무슨 집합을 돌리는지 안다
공유 real-QA 하네스가 수집한 집합이 **Git 추적 집합과 다르면, 실행 시점에 실행자가 그 사실과
어긋난 파일 이름을 안다.** "다르다" 만 알리는 것으로는 부족하다 — **어느 파일인지**까지 나와야
실행자가 자기 상황을 판단할 수 있다.
> 근거: §1-2 에서 548→549 가 되는 동안 실행자에게 도달한 신호가 **0개**였다.

### I-2. 미추적 스펙의 결과가 공식 수치에 이름 없이 섞이지 않는다
리뷰 보고서·PR 코멘트가 인용하는 *"N passed / M files"* 가 **추적 집합만으로 재현 가능**해야 한다.
다른 실행자가 같은 커밋을 신규 clone 해서 돌렸을 때 같은 기준 수치에 도달할 수 있어야 한다.
> 근거: #949 · #951 · #952 가 각각 독립적으로 보고서 수치를 재현하지 못했다.

### I-3. 로컬 개발자가 자기 스펙을 만들어 돌리는 경로가 살아 있다
미추적 로컬 스펙을 작성해 **의도적으로** 실행하는 경로가 **존재하고, 문서에 명시되고, 실제로
동작함이 실증**되어야 한다. 이 슬라이스는 그 사용을 **금지하지 않는다** — 그것이 *조용히 섞이는 것*만 막는다.
> 근거: `.gitignore:89~95` 에 7개 디렉터리가 등재돼 있다는 것 자체가 이 워크플로가 **정착된 관행**임을 뜻한다.

### I-4. 검증 도구의 결과가 파생물 신선도에 좌우되면 실행자가 즉시 안다
로컬 검증 명령(`npm test` · `npm run typecheck` · 공유 real-QA 배치)이 **소스보다 낡은 파생물**
(`out/**` · `file:` 의존 `dist` · 설치된 `node_modules`)을 읽고 있다면, 그 사실이 **실패 메시지에서
구분 가능**해야 한다. **"코드가 틀렸다" 로 읽히는 실패가 실제로는 "파생물이 낡았다" 인 상태는 허용되지 않는다.**
> 근거: §1-5 — 이 PC 에서 3개의 실패가 전부 코드 결함처럼 보였고 셋 다 코드 결함이 아니었다.

### I-5. 어떤 변경도 현재 추적 집합을 줄이지 않는다
이 슬라이스의 결과로 공유 하네스가 수집하는 **추적 스펙이 단 1개라도 줄어들면 실패**다.
개수뿐 아니라 **이름 단위**로 같아야 한다.
> 근거: §1-4 의 지뢰 + `#864`(82스펙 무력화) + `playwright.real-qa.config.ts:7~13` 의 R2 사고 기록.

---

## 3. 🚨 RED-first 요구

새로 만드는 게이트는 **고치기 전 상태로 되돌렸을 때 RED 가 되는지**를 원문으로 증명한다
([[feedback_ungated_surface_and_mock_covering_defect]] R4 — *"RED 가 안 되면 그 게이트는 장식이다"*).

이 슬라이스에서 **반드시 왕복해야 하는 뮤테이션 2종**:

| # | 뮤테이션 | 기대 |
|---|---|---|
| **M-1 (정방향)** | `.gitignore` 대상 디렉터리에 미추적 `*-real-qa.spec.ts` 1개를 주입 | 게이트 **RED** · 삭제하면 **GREEN** |
| **M-2 (역방향 — 이 슬라이스의 핵심)** | 배제 기준을 "`.gitignore` 디렉터리 목록" 으로 순진하게 바꿈 | **F-2 가 RED** (추적 스펙 2개 소실을 잡아야 함) |

**M-2 가 RED 가 되지 않으면 이 슬라이스는 §1-4 의 지뢰를 밟은 채 머지된다.**
M-1 만 확인하고 넘어가는 것은 불충분하다.

주입·원복 시 `git status --porcelain` 이 계속 비어 있어야 한다(§1-2 처럼) — 그래야 실험 자체가
추적 트리를 오염시키지 않는다.

---

## 4. 게이트 커버리지 — *"이 변경의 어느 표면이 CI 에서 실행되는가"*

[[feedback_ungated_surface_and_mock_covering_defect]] R1 이 요구하는 한 문장 답을 미리 확보한다.

**실측된 사실 (지시가 아니라 선택지 판단 재료)**:

- `clients/**` 를 건드리면 **`ci.yml` 과 `qa-e2e.yml` 이 둘 다 발동**한다
  (`ci.yml` `paths-ignore` 에 `clients/**` 없음 · `qa-e2e.yml` `paths` 에 `clients/**` 있음).
  ⟹ `clients/desktop/**` 안에 두는 게이트는 **트리거 공백이 없다.**
- `ci.yml` `frontend-desktop` 잡이 실행하는 것: `typecheck` → `lint` → `build` → `build:web`
  → `build:capacitor` → **`npm test`(vitest)** → `test:round-910-contract`.
- `qa-e2e.yml` `desktop-playwright` 잡이 실행하는 것: `qa-output-path-guard.test.cjs` →
  `npx playwright test`(**mock 게이트**) → `assert-playwright-ran.mjs`.
- **공유 real-QA config 자체를 실행하는 잡은 0개.** `tsconfig.node.json` `include` 를 통한
  **typecheck 커버리지만** 있다(#851 R1 이 추가).

⟹ 구현자는 **"내가 만든 게이트를 어느 잡이 실행하는가"** 에 한 문장으로 답할 수 있어야 한다.
답할 수 없으면 그 게이트는 게이트가 아니다.

---

## 5. 회귀 울타리 — *"이것은 계속 동작해야 한다"*

🚩 이 레포의 전형적 사고는 **fix 가 기존 경로를 조용히 죽인 것**이다. 아래는 전부 **머지 전 실측으로 확인**한다.

| # | 울타리 | 기준값 (이 PC 2026-07-28 실측, `40c415426`) |
|---|---|---|
| **F-1** | 공유 하네스 수집이 **줄지 않는다** | `Total: 548 tests in 172 files` (renderer `547 / 171` + order-app `1 / 1`) |
| **F-2** | 🚩 `.gitignore` 등재 디렉터리 안의 **추적 스펙 2개가 계속 수집된다** | `manual/slip-form-3d-real-qa.spec.ts` · `dispatch-collab-real-qa/dispatch-collab-real-qa.spec.ts` — **이름 단위로 확인**(개수만 세면 통과해 버린다) |
| **F-3** | #851 R1 의 **order-app 프로젝트 분리가 유지된다** | `928-web-version-check-real-qa/**` = `order-app` 프로젝트 1개 · `renderer` 는 그 글롭을 `testIgnore` · 합계 `1 + 547 = 548` 정확히 일치(누락·중복 0) |
| **F-4** | **mock 게이트 집합 불변** — 이 슬라이스는 mock 게이트를 건드리지 않는다 | `Total: 652 tests in 117 files` |
| **F-5** | 🚩 **`-real-qa` 접미사 규칙과 충돌하지 않는다** | mock config `testIgnore` 의 `**/*-real-qa.spec.ts` · `**/*-real-qa/**` 가 그대로 유효. 새 배제 기준이 이 규칙을 **대체하거나 무력화하지 않는다** ([[project_dispatch_on_inspect_epic]] 슬4 — 접미사 밖 디렉터리에 두면 CI mock 잡이 실행돼 ECONNREFUSED, PR #593 실측) |
| **F-6** | **격리 실행 경로가 계속 동작한다** | `playwright test --config=playwright.real-qa.config.ts <스펙경로>` 로 특정 슬라이스만 실행 (config 헤더 49~51행에 문서화된 정본 사용법) |
| **F-7** | **로컬 개발자의 정당한 워크플로가 살아 있다** (I-3) | 미추적 로컬 스펙을 **의도적으로** 실행하는 경로가 실증된다 |
| **F-8** | **공유 config 의 typecheck 커버리지 유지** | `tsconfig.node.json` `include` 에 `playwright.real-qa.config.ts` 가 남아 있다(#851 R1 이 확보한 유일한 CI 커버리지) |

---

## 6. U-gate — 사용자가 실데이터로 무엇을 할 수 있게 되는가

이 슬라이스의 **사용자 = QA 를 돌리는 개발자**다.

> **한 문장**: QA 개발자가 자기 실제 작업 트리에서 공유 real-QA 하네스를 실행하면,
> **자기가 지금 추적 집합(172파일)과 같은 것을 돌리는지, 다르면 정확히 어느 파일이 섞였는지를
> 실행 출력에서 즉시 본다.**

**머지 전 PM 이 실제로 1회 실행할 시나리오** (실데이터 트리 = `D:\dev\Samhan-Public`, mock 아님):

1. `D:\dev\Samhan-Public\clients\desktop` 에서 공유 real-QA 하네스를 실행한다.
   → **추적 집합과 일치**한다는 신호를 본다 (이 PC 현재 기준 172 파일).
2. `clients/desktop/playwright/n1b-native-qa/zzz-probe-real-qa.spec.ts` 를 하나 만든다.
   → `git status --porcelain` 은 **여전히 빈 출력**이다(`.gitignore:93` 대상).
3. 다시 실행한다.
   → **"추적되지 않는 스펙이 섞였다: `n1b-native-qa/zzz-probe-real-qa.spec.ts`"** 를 **화면에서 읽는다.**
   *(현재는 아무 신호 없이 549/173 이 되고 끝난다 — §1-2)*
4. 그 파일을 지우고 다시 실행한다. → 1번의 일치 신호로 돌아온다.
5. **I-3 확인** — 문서에 적힌 "내 로컬 스펙을 의도적으로 돌리는 경로" 를 그대로 따라 하면
   2번의 스펙이 **실제로 실행된다**(막히지 않는다).

⚠️ 5번이 동작하지 않으면 **정당한 워크플로를 죽인 것**이므로 U-gate 실패다.

---

## 7. 확증하지 못한 것 (정직 기록)

- **집 PC 의 `558/176`** — 이 PC 에서 재현 불가(그 디렉터리들이 없음). 이슈 기재 수치를 그대로 인용했다.
- **#951 의 `1648` vs 보고서 `1643`** — 이 PC 는 `1648 tests / 179 files` 이고 **179 파일 전부 추적**이다.
  즉 이 PC 에서 그 5 의 차이는 **미추적 파일로 설명되지 않는다.** 커밋 차이일 가능성이 크나 확증하지 못했다.
  ⟹ **vitest 는 이 슬라이스의 표면이 아니다**(§1-6 대조군).
- **#952 의 `175 files / 1632 tests`** — 다른 커밋 기준으로 보이며 이 PC 에서 대조하지 못했다.
- **집 PC 의 `electron-updater` 미설치 주장** — 이 PC 는 설치돼 있어 확인 불가.
  단 §1-5 가 보이듯 **설치돼 있어도 같은 단언이 실패**하므로, 그 관측이 원인을 잘못 짚었을 가능성이 있다.

---

## 8. 범위

### 포함

- `clients/desktop/playwright.real-qa.config.ts` — 수집 집합의 **추적 정합 신호**(I-1 · I-2)
- 그 신호를 지키는 **회귀 게이트 1개** — RED-first 왕복 **M-1 · M-2 둘 다**(§3)
- **I-3 경로의 명문화** — 로컬 개발자가 자기 스펙을 의도적으로 돌리는 방법을 문서에 남긴다
- **I-4 의 신호화** — 파생물 stale 을 실행자가 구분할 수 있게 한다(어디에·어떻게는 **구현 재량**)
- 레포 규약 문서 동기화 ([[feedback_continuous_docs_sync]])

### 제외 — 🚫 범위 동결

| 제외 대상 | 이유 |
|---|---|
| **`.github/workflows/qa-e2e.yml`** | **PR #957 이 지금 수정 중**(+3/−1). 같은 파일 동시 수정 = 충돌 + stacked false-green ([[feedback_stacked_pr_ci_false_green]]) |
| `scripts/lib/qa-shots-dir.*` · `qa/playwright/utils/screenshot.ts` · `clients/desktop/src/main/capture.ts` · `clients/desktop/scripts/qa-output-path-guard.test.cjs` | **PR #957 소유** (실측: #957 변경 파일 목록에 전부 포함) |
| **#851 슬3 (`qa-e2e.yml:56` 의 `\|\| true` 제거)** | **함께 처리하지 않는다.** ①그 줄은 `qa-e2e.yml` 안이고 그 파일은 #957 소유다. ②그 `\|\| true` 는 **`qa/playwright` 트리의 dry-run 스텝**(53~57행)으로, 이 슬라이스가 다루는 `clients/desktop` 공유 real-QA 하네스와 **코드 경로가 겹치지 않는다** — *"게이트가 무엇을 실행하는가"* 라는 **질문만** 같다. ③합치면 도달성 검증 대상이 2배가 되고 라운드가 늘어난다([[feedback_throughput_parallel_scope_freeze_batch]] R2 · 범위 동결) |
| `.gitignore` 89~95행 재정리 | §9 E-1 로 분리 — PM 판단 |
| `clients/desktop/playwright.config.ts` (mock 게이트) | F-4 로 **불변 고정**. 이 PC 실측 오염 0건(§1-6) |
| vitest 수집 표면 | 이 PC 실측 오염 0건(§1-6) · §7 미확증 |
| 새 이슈 등록 | 🚫 금지 ([[feedback_backlog_burndown_issue_bar]]) |

---

## 9. 🚩 범위 확대 제안 — **PM 판단 요청** (임의로 넓히지 않았다)

### E-1. `.gitignore:89 manual/` · `:92 dispatch-collab-real-qa/` 는 **모순 상태**다
두 디렉터리는 무시 목록에 있으면서 **추적 파일 9개**를 품고 있다(§1-4). 이 모순이 §1-4 지뢰의 원인이고,
`git check-ignore` 가 두 가지 답을 내는 이유다. 정리하면 근본이 단순해진다.
**그러나** `.gitignore` 변경은 다른 트랙의 작업 트리에 영향을 준다 — 지금까지 무시되던 로컬 잔재가
갑자기 `git status` 에 뜬다(현재 3트랙 병렬 운영 중). **PM 판단.**

### E-2. `assert-playwright-ran.mjs` 에 **최소 실행 건수 하한이 없다**
`expected>0` · `unexpected==0` · `skipped==0` 만 강제한다. 메모리에 이미 기록돼 있다 —
*"`testMatch`/`testIgnore` 축소를 못 잡는다(#864 가 공유 config 를 좁혀 82스펙을 무력화했는데 통과한 경로)"*
([[feedback_ci_test_filter_false_green]]). **F-1 과 정확히 같은 축**이지만 그 스크립트는 **mock 게이트 전용**이라
표면이 다르고, 손대면 F-4 를 스스로 흔든다. **PM 판단.**

### E-3. ⚠️ **충돌 위험 — `harness-false-green-guard.test.ts` 를 PR #957 이 수정 중**
이 레포의 하네스 가드 정본(`clients/desktop/src/renderer/test-utils/harness-false-green-guard.test.ts`,
2033행 · G1~G12)은 새 게이트의 **가장 자연스러운 위치**이고, `ci.yml frontend-desktop` 과
`harness-guard.yml` 이 **둘 다 실행**한다. 그런데 **PR #957 이 그 파일을 `+4 / −13` 로 수정 중**이다.
PM 이 주신 범위 밖 목록에는 없었으므로 **보고만 드리고 결정하지 않았다.**
선택지: ① #957 머지 후 착수 ② 별도 파일에 게이트 신설 ③ 다른 위치. **PM 판단.**

> 🚩 위 3건은 **이 슬라이스에서 임의로 착수하지 않는다.** PM 이 명시적으로 지시할 때만 편입한다.

---

## 10. 금지

- 🚫 `testMatch` 를 **좁히는 방향의 단순 수정** — 이 파일에서 두 번 사고를 냈다(§1-4). 하려면 F-1·F-2 를 먼저 세우고 하라.
- 🚫 `git check-ignore` 를 **기본 모드로만** 판정 근거로 쓰기 — index 참조 여부로 답이 뒤집힌다(§1-4).
- 🚫 M-2 역방향 뮤테이션 **생략** — 이 슬라이스의 핵심 위험이다(§3).
- 🚫 `--list` · typecheck 류 **정적 게이트로 라이브QA 대체** ([[feedback_canonical_workflow]]).
- 🚫 범위 밖 파일 수정(§8) · 새 이슈 등록.
- 🚫 스크린샷·수치의 **합성/추정** — 실측만 ([[feedback_no_fake_data_ever]]).
