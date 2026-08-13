---
name: feedback-ungated-surface-and-mock-covering-defect
description: CI green 을 게이트로 세기 전에 "그 CI 가 무엇을 검사하지 않는지" 를 먼저 확인한다 — Electron main 이 게이트 0 인 채 깨진 채로 머지된 실측
metadata:
  type: feedback
---

# 🚨 "CI green" 을 세기 전에 **그 CI 가 검사하지 않는 표면**을 먼저 찾아라

**2026-07-26 개발책임자 지적** — *"PM이 왜 이런것도 못보고 지금 main이 깨지도록 놔둔거야??"*

## 무슨 일이 있었나

`29383b1f1`(2026-07-24, #909 데스크톱 자동 업데이트)이 머지된 뒤 **main 에서 `npm run dev` 가 기동하지 않았습니다.**

```
out/main/index.js:6  import { autoUpdater } from "electron-updater";
SyntaxError: Named export 'autoUpdater' not found.
             The requested module 'electron-updater' is a CommonJS module
```

원인 — `clients/desktop/package.json` 이 `"type": "module"` 이고 `electron-updater@6` 은 CJS 진입점인데, `electron.vite.config.ts` 의 `format: 'cjs'` 는 **preload 전용**이라 main 이 ESM 으로 출력됩니다. Node 가 ESM 으로 로드해 CJS 에서 named import 를 시도하다 실패합니다.

**이틀간 아무도 데스크톱 앱을 로컬에서 띄우지 못했고, 그 사이 여러 PR 이 "CI green" 으로 머지됐습니다.**

## 왜 어떤 게이트도 못 잡았나 — 세 겹

| # | 구멍 |
|---|---|
| **① 게이트 0 표면** | `ci.yml` 에 **Electron main 을 로드하는 스텝이 0개**. PyYAML 전수 확인 — `electron .`·`electron-vite dev`·`xvfb` 류 매치 없음. `src/main/**` 은 검사되지 않는 표면이었다 |
| **② mock 이 결함을 덮음** | `auto-update.test.ts:33` `vi.mock('electron-updater', () => ({ autoUpdater: mocks.autoUpdater }))` — **깨진 그 import 자체를 대체**한다. 단위 테스트는 통과할 수밖에 없었다 |
| **③ "라이브QA" 가 앱을 실행하지 않음** | 데스크톱 트랙의 라이브QA 는 **Playwright 로 렌더러를 브라우저에 띄운 것**이었다. Electron 을 실행한 적이 없다. `npm run dev` 한 번이면 즉시 나왔다 |

## 규칙

### R1. CI green 을 게이트로 세기 전에 **커버리지 공백을 명시**하라
PR 을 머지 판단할 때 *"CI 가 green 이다"* 로 끝내지 말고 **"이 변경의 어느 표면이 CI 에서 실행되는가"** 를 한 문장으로 답하라. 답할 수 없으면 그 표면은 게이트가 없는 것이다.

실측된 게이트 0 표면(2026-07-26 기준):
- **`clients/desktop/src/main/**`** — Electron main 프로세스. 런타임 로드 스텝 없음
- **`clients/mobile`** — `ci.yml` 에 잡 자체가 없음
- **모바일 3앱 jest** — `frontend-mobile-staff`·arologis `mobile` 잡이 typecheck·expo-doctor·prebuild 만 실행

### R2. **mock 이 결함 표면을 덮고 있는지** 를 fix 전에 확인하라
이 레포에는 이미 같은 계열 규칙이 여럿 있다([feedback_restclient_contract_test_false_green](feedback_restclient_contract_test_false_green.md) · [feedback_enforcement_real_http_test](feedback_enforcement_real_http_test.md) · [feedback_inprocess_mock_principles](feedback_inprocess_mock_principles.md)). **그 렌즈를 BE 계약에만 적용하지 말고 빌드·런타임·모듈 해석에도 적용하라.**

판별 질문: *"이 테스트가 mock 하는 것이, 결함이 실제로 발생하는 그 지점인가?"* 예이면 그 테스트는 그 결함을 **구조적으로** 못 잡는다.

### R3. 데스크톱 "라이브QA" 는 **Electron 을 실행**해야 한다
브라우저에 렌더러를 띄우는 것은 **렌더러 QA** 이지 데스크톱 앱 QA 가 아니다. main 프로세스·preload·패키징·자동 업데이트를 건드리는 변경은 **`npm run dev` 또는 패키징 산출물을 실제로 기동**해야 라이브QA 로 인정한다.

관련 실측 — 렌더러는 `VITE_PLATFORM='web'` 이 아니면 `createHashRouter` 를 쓰므로 Playwright `goto` 는 `${BASE_URL}/#/경로` 여야 한다([feedback_realqa_run_and_false_red](feedback_realqa_run_and_false_red.md) 참조).

### R4. 게이트 없는 표면을 발견하면 **그 자리에서 게이트를 만들어라**
fix 만 하고 넘어가면 같은 결함이 재발한다. 그리고 **새 게이트가 진짜인지 증명하라** — 고치기 전 코드로 되돌려 RED 가 되는지 확인한다. RED 가 안 되면 그 게이트는 장식이다.

## 왜 중요한가

머지 게이트 ②는 *"CI green (exact SHA)"* 인데, **CI 가 그 표면을 실행하지 않으면 green 은 아무것도 증명하지 않는다.** PM 이 green 을 세는 행위 자체가 거짓 확신을 만든다.

같은 세션에 나온 자매 사례 — `datagrid-interaction.spec.ts` 가 CI 하드 게이트에서 **7 passed** 인데 7개 전부 *"DataGrid 셀 미발견"* 을 찍고 soft-pass 한다(`console.warn` 이라 통과). 커밋된 캡처 파일명이 `TC-DG-1-no-grid-cells.png` 다.

## 관련
[[feedback_pm_verify_what_measurement_proves]] · [[feedback_ci_test_filter_false_green]] · [[feedback_qa_docker_real_test]] · [[feedback_live_qa_penetrates_it_masking]] · [[feedback_gradle_test_cache_false_green]]

---

## 🚨 2026-08-11 — 한 세션에서 false-green **5건**. 다섯을 관통하는 축은 둘이다

```text
① toContainText + 자동 스크롤 click   안 보이는 dropdown 을 통과시켰다        (#1168)
② main.app-main.scrollTop 검사        **움직이지 않는 컨테이너**를 봤다        (#1168)
③ 관측을 조작보다 늦게 검             문제 rAF 를 놓쳤다 (rollback 2/10 RED)   (#1168)
④ exact 검사기의 0 초기값             중복 grant 를 OR 로 합쳐 감췄다          (#1170)
⑤ mock 이 실 서버 401 로 빠짐         **로그인 화면에 있는데** 통과했다        (#1166)
```

### 🔑 두 축

```text
A. **무엇을 보는가** 가 틀렸다        ② ④    — 엉뚱한 대상 · 합쳐서 구별 소실
B. **어디에 / 언제 도달했는가** 가 틀렸다  ① ③ ⑤ — 안 보이는 것 · 늦은 관측 · 다른 화면
```

⟹ 리뷰 브리핑에 **둘 다** 물어라. "이 검사가 무엇을 보는가" 만 물으면 B 를 놓친다.

### 실전 질문 (그대로 브리핑에 넣을 것)

```text
✅ 이 단정이 **실패할 수 있는 형태**로 쓰여 있는가 — fix 를 되돌려 10회 돌려 10/10 RED 인가
   (1~2회로는 안 된다. ③ 은 2/10 만 RED 였고 8/10 이 false-green 이었다)
✅ 검사가 보는 대상이 **실제로 움직이는/변하는 것**인가
✅ 여러 행을 합쳐(OR·SUM·Set·객체키·Map.put·merge) 비교하지 않는가 — 중복이 사라지지 않는가
✅ 🚨 캡처·단정 전에 **그 화면에만 있는 요소**를 하나 단정해 도달을 증명하는가
   (⑤ 는 로그인 화면에서 통과했다. 해시라우터 홈 낙착과 같은 병)
✅ mock 경로가 **실 서버로 새지 않는가** — 새면 401/404 가 환경 의존 red/green 을 만든다
```

### 🚩 그리고 fix 는 검사기에도 결함을 남긴다

`#1170` 에서 "exact" 라 이름 붙인 검사기가 **그 자체로** 중복을 감췄고, 고치자 **감춰져 있던 진짜 중복 1건**(mock.ts `SP_D1_DEFAULT_EDIT.ACCOUNTANT`)이 나왔다. false-green 은 가설이 아니라 **실제로 무언가를 덮고 있을 수 있다.**

관련: [[feedback_qa_pass_is_not_defect_zero]] · [[feedback_verify_playwright_gate_before_adversarial]] ·
[[feedback_live_qa_use_playwright_not_browser_runtime]] · [[feedback_qa_harness_commit_breaks_ci]]
