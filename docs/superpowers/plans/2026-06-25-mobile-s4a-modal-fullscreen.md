# 모바일 슬4a — 공용 Modal 모바일 풀스크린 Implementation Plan

> **For agentic workers:** canonical 워크플로우([[feedback_canonical_workflow]]): 본 plan=Opus 기획. 구현=Codex(danger-full-access). 듀얼리뷰 0수렴+라이브QA. **매 단계 ScheduleWakeup loop**([[feedback_autonomous_loop_schedulewakeup]]).

**Goal:** 공용 `Modal`(32화면)을 ≤768px 풀스크린으로 렌더(데스크탑 무변동, CSS-only, FE-only, Flyway 0).

**Architecture:** `Modal.module.css` `@media(max-width:768px)` 한 블록에서 backdrop padding 제거 + dialog 풀스크린(width/height 100%·max-width none·min-width 0·border-radius 0·100dvh) + header sticky top + footer sticky bottom(safe-area). Modal.tsx 무변경 → 32 사용처 자동 적용. 모달 모양은 라이브 QA 스샷 보정.

**Tech Stack:** CSS Modules / React / Playwright(mock + real-qa).

## Global Constraints
- **데스크탑(>768px) 무변동** — 신규 CSS 전부 `@media(max-width:768px)` 안. >768px `.backdrop/.dialog/.size-*/.header/.body/.footer` 불변. prefers-reduced-motion·애니 무수정.
- **FE-only·Flyway 0·BE 무변경·Modal.tsx 무변경**. 변경 1파일: Modal.module.css.
- design-system 기존 변수(--space-*/--color-*/--radius-*) 사용. 신규 토큰 금지.
- 모달 모양/간격 = 라이브 QA 캡처 후 반복 보정([[feedback_print_design_iteration]]).
- 신규 mock spec = 로컬 mock Playwright 실행 + ci 무회귀([[feedback_platform_branch_build_time_flag]]).

---

## File Structure
- Modify `clients/web/design-system/src/components/Modal/Modal.module.css` — @media 풀스크린 블록.
- Create `clients/desktop/playwright/mobile-s4a-modal-fullscreen/mobile-s4a-modal-fullscreen.spec.ts` — 풀스크린 mock spec.
- Create `clients/desktop/scripts/mobile-s4a-modal-qa.cjs` — real-qa(390px) 캡처.

---

## Task 1: Modal 풀스크린 @media CSS

**Files:** Modify `clients/web/design-system/src/components/Modal/Modal.module.css`

- [ ] **Step 1: @media 블록 추가**(파일 끝, 기존 클래스명 .backdrop/.dialog/.size-sm/md/lg/xl/.header/.body/.footer 대조 후):
```css
@media (max-width: 768px) { /* 모바일 Modal 풀스크린 */
  .backdrop { padding: 0; }
  .dialog {
    width: 100%; height: 100%;
    max-width: none; min-width: 0;
    max-height: 100vh; max-height: 100dvh;
    border-radius: 0;
  }
  .header { position: sticky; top: 0; background: var(--color-bg); z-index: 1; }
  .body { flex: 1 1 auto; }
  .footer {
    position: sticky; bottom: 0;
    border-bottom-left-radius: 0; border-bottom-right-radius: 0;
    padding-bottom: max(var(--space-3), env(safe-area-inset-bottom));
  }
}
```
  (size-xl `min-width:980px` override = min-width:0. 데스크탑 규칙은 @media 밖 불변.)
- [ ] **Step 2: 검증** — design-system `npm run build` 0 + desktop `npm run typecheck` 0 + `npm run build:web` 0.
- [ ] **Step 3: 커밋** — `[FEAT] 모바일 슬4a — 공용 Modal 모바일 풀스크린 @media`

---

## Task 2: 풀스크린 mock spec + 로컬 실행 + 무회귀

**Files:** Create `clients/desktop/playwright/mobile-s4a-modal-fullscreen/mobile-s4a-modal-fullscreen.spec.ts`

- [ ] **Step 1: spec** — mock(VITE_MOCK_MODE) HashRouter. 390x844 viewport: Modal 여는 화면(예 재고조회/버전이력/SaveDialog) goto→로그인→모달 트리거 클릭→`role=dialog` 가시·dialog 박스가 viewport 거의 채움(boundingBox width≈innerWidth·height≈innerHeight)·헤더 닫기 버튼 보임 단언. 1280 viewport: 모달이 중앙 카드(width<innerWidth, max-width 적용) 단언.
- [ ] **Step 2: 로컬 실행(필수)** — `cd clients/desktop && npx playwright test playwright/mobile-s4a-modal-fullscreen --workers=1 --reporter=line` → PASS.
- [ ] **Step 3: 무회귀** — Modal 사용 기존 spec 1~2개(데스크탑 viewport, 예 inventory-lookup-modal 류) 로컬 실행 → 모달 무회귀.
- [ ] **Step 4: 커밋** — `[TEST] 모바일 슬4a — Modal 풀스크린 mock spec(≤768px 풀스크린+데스크탑 중앙)`

---

## Task 3: 라이브 QA(390px) + 스크린샷 보정 + dev-report

**Files:** Create `clients/desktop/scripts/mobile-s4a-modal-qa.cjs`, `docs/qa/mobile-s4a-modal-fullscreen/`

- [ ] **Step 1: real-qa** — Playwright(슬3 패턴). build:web→:5175. 390x844: 로그인(dev_master)→대표 모달 2~3개(버전이력 패널·조회 모달·SaveDialog 등) 열기→풀스크린·헤더 닫기·푸터 액션·body 스크롤 캡처. 1280: 모달 중앙 카드 캡처. 실 캡처 `docs/qa/mobile-s4a-modal-fullscreen/`.
- [ ] **Step 2: 캡처 확인 + 개발책임자 전달** — Read + SendUserFile/PR 인라인 → 모달 모양 보정 수렴([[feedback_print_design_iteration]]).
- [ ] **Step 3: dev-report** — `docs/dev-reports/2026-06-25-mobile-s4a-modal-fullscreen.md`.
- [ ] **Step 4: 커밋** — `[QA] 모바일 슬4a — Modal 풀스크린 라이브 캡처 + 보정`

---

## Self-Review
- **Spec 커버리지:** §3.1(방식)→T1, §3.2(효과)→T1+T3, §3.3(무회귀)→T1/T2, §4(검증)→T2/T3. ✅
- **Placeholder:** 없음.
- **무회귀 가드:** @media 한정·데스크탑 단언(T2/T3). 1파일·Flyway 0·Modal.tsx 무변경.
