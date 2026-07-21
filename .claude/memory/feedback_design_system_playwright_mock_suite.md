---
name: feedback_design_system_playwright_mock_suite
description: design-system 공용 컴포넌트(AsyncAutocomplete·PartnerAutocomplete 등) 변경은 vitest·타입체크만으론 행동 회귀를 못 잡는다. desktop Playwright mock 회귀 스위트(ac-*·listbox 계열)를 반드시 로컬 실행해야 하며 CI "mock 회귀 hard gate"가 최종 권위다. 2026-07-17 #825 슬1.
metadata:
  type: feedback
---

**사건(2026-07-17 #825 슬1)**: AsyncAutocomplete 매치 하이라이트 + false-empty fix 를 넣고 **design-system vitest 61 + desktop vitest 810 + typecheck 0 + 타깃 라이브 QA(하이라이트) 전부 green** 이라 수렴 선언·머지 직전까지 갔으나, **CI "Desktop Playwright (mock 회귀 hard gate)" 잡의 ac-2/ac-3 autocomplete 테스트가 FAILURE**. 근본원인 = handleChange 가 debounce 대기 중 후보를 비우고 status='loading' 즉시 전환 → listbox 가 빈 후보로 표시 → 테스트가 loading 중 `toBeVisible` 통과 후 ArrowDown+Enter → 후보 없어 미선택 → listbox 미닫힘("listbox 표시 ⟹ 후보 존재" 불변식 파괴). **vitest·정적 적대검증(4렌즈)·타깃 QA 전부 이 행동 회귀를 못 잡았고, CI Playwright mock 스위트만 포착**.

**무엇이 잘못이었나**: design-system 공용 컴포넌트(전 소비처 blast radius)를 바꾸면서 **행동(키보드 네비·드롭다운 개폐·debounce 타이밍·선택) 회귀를 검증하는 Playwright mock 스위트를 안 돌림**. vitest 는 렌더 단위라 실 브라우저의 debounce/loading/select 타이밍 상호작용을 재현 못 한다. [[feedback_changed_module_full_test_before_push]] 의 "변경 모듈 전체 test" 를 design-system 은 **Playwright mock gate 까지** 포함해야 함.

**How to apply**:
1. **design-system 컴포넌트(특히 AsyncAutocomplete/PartnerAutocomplete/ProductAutocomplete/Select 계열·dropdown/listbox) 변경 시**: push·수렴선언 전 반드시 로컬 실행 —
   `cd clients/web/design-system && npm run build`(dist 사전빌드, desktop 이 dist 참조) →
   `cd clients/desktop && npx playwright test playwright/ac-2-product-autocomplete playwright/ac-3-partner-autocomplete`(+ 영향 listbox 스펙: bundle-set-options·journal-form-dropdown·codef-fe-bc3·groupware-approval-line-config). webServer :5173 자동기동(VITE_MOCK_MODE=1)·`playwright.config.ts`.
2. **광범위 영향 시 mock gate 전체**: `cd clients/desktop && npx playwright test`(testIgnore 로 real-qa/manual/full-qa 제외됨). CI 와 동일.
3. **vitest green = 행동 무결 아님**. 실 브라우저 상호작용(포커스·키보드·debounce·async 응답 타이밍·개폐)은 Playwright 만 잡는다.
4. 적대검증(OPUS/CODEX) 렌즈에 "design-system 변경이면 Playwright mock 스위트 실행 결과 확인" 항목 추가. 정적분석·vitest 만으로 "수렴" 선언 금지.

→ [[feedback_realqa_run_and_false_red]](고아 vite·false-RED)·[[feedback_changed_module_full_test_before_push]] 연장.

---

## 🚨 2026-07-22 실측 — **stale `dist` 는 "fix 미적용" 으로 오판된다 (라이브QA 도 대상)**

위 1번이 `npm run build`(dist 사전빌드)를 이미 요구하지만 **문맥이 "Playwright mock 스위트" 한정**이라, **라이브QA** 를 도는 사람이 자기 일이 아니라고 읽는다. 실제로 #864 R4 라이브QA 가 그렇게 놓쳤다.

**무슨 일이 있었나**: `clients/web/design-system/dist/index.js` 가 소스보다 오래된 상태였다. desktop 은 `exports → ./dist/index.js` 로 해석하므로 **구 번들**이 로드됐고, E-P1 fix(`AsyncAutocomplete` 로딩 행 `aria-disabled`)가 소스에는 있는데 **측정값은 `null`** 이었다. ⟹ 하마터면 **"fix 가 적용되지 않았다"** 는 결함 보고가 나갈 뻔했다. 실제로는 **fix 는 멀쩡하고 측정이 구 코드를 본 것**이다.

**Why 위험한가**: 이 오판은 **양방향**이다. ① fix 가 됐는데 안 됐다고 보고(오경보 → 없는 결함 fix → 새 표면) ② **fix 가 안 됐는데 구 dist 가 우연히 통과시켜 green**(무마). 둘 다 라운드를 태운다. `git status` 는 깨끗하고 소스도 옳으므로 **어떤 정적 확인으로도 안 잡힌다.**

**How to apply**:
- 🚨 **design-system 을 건드린 슬라이스는 라이브QA·mock QA·수동 확인 어느 것이든 시작 전에 `cd clients/web/design-system && npm run build` 를 먼저** 한다. "Playwright 를 안 쓰니 해당 없다" 는 오독이다.
- QA 보고에 **dist 빌드 시각 vs 소스 mtime** 을 증거로 남긴다(배포 증명이 이미지 시각을 남기는 것과 같은 층위).
- 컴포넌트 fix 를 측정했는데 **기대와 다르면, 결함으로 단정하기 전에 dist 신선도부터 의심**한다. [[feedback_pm_verify_what_measurement_proves]] 의 *"이 측정이 증명하는 것"* 을 적용하면 — 구 번들 측정이 증명하는 것은 *"구 번들에 그 속성이 없다"* 이지 *"fix 가 안 됐다"* 가 아니다.
- 📌 같은 계열: 배포 stale(이미지가 브랜치 코드 이전) **5연속 실측** · gradle 캐시 `UP-TO-DATE` · Playwright 포트 5173 재사용(타 워크트리 코드 측정). **전부 "옳은 코드를 옳게 고쳤는데 측정이 다른 것을 봤다"** 는 한 가족이다.
