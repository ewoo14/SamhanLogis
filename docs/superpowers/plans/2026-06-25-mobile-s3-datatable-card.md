# 모바일 슬3 — DataTable 모바일 카드화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 superpowers:executing-plans. 본 프로젝트 실 프로세스=canonical 워크플로우([[feedback_canonical_workflow]]): 본 plan=Opus 기획. 구현=Codex(danger-full-access), 듀얼리뷰 0수렴.

**Goal:** 공용 `DataTable` 을 ≤768px 에서 행=카드(라벨-값)로 렌더해 57개 리스트 화면을 모바일 사용 가능하게 한다(데스크탑/인쇄 무변동, CSS-only, FE-only, Flyway 0).

**Architecture:** `DataTable.tsx` 의 각 `<td>` 에 `data-label={col.header}` 부착(유일 TSX 변경) + `DataTable.module.css` `@media(max-width:768px)` 블록에서 table→card 변환(`td::before{content:attr(data-label)}` 라벨). 57개 소비처 코드 변경 0(자동 적용). 카드 모양은 라이브 QA 스크린샷으로 반복 보정([[feedback_print_design_iteration]]).

**Tech Stack:** TypeScript / React / CSS Modules / Vitest / Playwright(mock + real-qa).

## Global Constraints
- **데스크탑(>768px)·인쇄(@media print) 완전 무변동** — 카드 CSS 전부 `@media(max-width:768px)` 안에만. >768px 테이블 규칙 불변.
- **FE-only·Flyway 0·BE 무변경**. 변경 2파일: DataTable.tsx + DataTable.module.css.
- design-system 기존 CSS 변수(--space-*/--radius-*/--color-*/--shadow-*) 사용. 신규 토큰 금지.
- 카드 모양/라벨/간격 = 라이브 QA 캡처 후 반복 보정(단번완성 금지 [[feedback_print_design_iteration]]).
- 신규 mock spec = 로컬 mock Playwright 실행 + ci 무회귀([[feedback_platform_branch_build_time_flag]]).
- typecheck = `npm run typecheck`(desktop). design-system 빌드 = `npm run build`(design-system, file: dep 재해석).

---

## File Structure
- Modify `clients/web/design-system/src/components/DataTable/DataTable.tsx` — `<td>` 에 data-label.
- Modify `clients/web/design-system/src/components/DataTable/DataTable.module.css` — @media 카드 블록.
- Create `clients/desktop/playwright/mobile-s3-datatable-card/mobile-s3-datatable-card.spec.ts` — 카드 mock spec.
- Create `clients/desktop/scripts/mobile-s3-datatable-card-qa.cjs` — real-qa(390px) 캡처.

---

## Task 1: DataTable data-label + 카드 CSS

**Files:**
- Modify: `clients/web/design-system/src/components/DataTable/DataTable.tsx`(td 렌더 line~168)
- Modify: `clients/web/design-system/src/components/DataTable/DataTable.module.css`

- [ ] **Step 1: data-label 부착** — DataTable.tsx tbody 의 `<td key=... className=...>` 에 `data-label={col.header}` 추가(빈 헤더는 빈 문자열). 렌더 로직·기타 props 무변경.
- [ ] **Step 2: 카드 @media CSS** — DataTable.module.css 끝에 추가(기존 변수명 확인 후):
```css
@media (max-width: 768px) { /* = --bp-md: DataTable 모바일 카드화 */
  .scroll { overflow: visible; }
  .table, .thead, .tbody, .tr, .td { display: block; }
  .thead { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
           overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; } /* 시각 숨김·a11y 보존 */
  .tr { border: 1px solid var(--color-neutral-200, #e5e7eb); border-radius: var(--radius-md, 8px);
        padding: var(--space-3, 12px); margin-bottom: var(--space-2, 8px);
        background: var(--color-bg-surface, #fff); box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,.06)); }
  .tr:hover { background: var(--color-bg-surface, #fff); }
  .td { display: flex; justify-content: space-between; align-items: baseline; gap: var(--space-3, 12px);
        padding: var(--space-1, 4px) 0; border: none; text-align: right; }
  .td::before { content: attr(data-label); font-weight: 600; color: var(--color-neutral-500, #6b7280);
                text-align: left; flex-shrink: 0; }
  .td[data-label=""]::before { content: none; }       /* 빈 라벨=값 풀폭 */
  .alignRight, .alignCenter, .alignLeft { text-align: right; }  /* 카드 값 우측 */
  .emptyCell, .emptyRow { display: block; }            /* MascotEmptyState 카드 밖 */
}
```
  (정확한 클래스/변수는 현 module.css 대조 후 정합. 데스크탑 규칙은 @media 밖 불변.)
- [ ] **Step 3: 검증** — design-system `npm run build` 성공 + desktop `npm run typecheck` 0 + `npm run build:web` 0. (시각=Task 3.)
- [ ] **Step 4: 커밋** — `[FEAT] 모바일 슬3 — DataTable data-label + 모바일 카드 CSS`

---

## Task 2: 카드 mock spec + 로컬 실행 + 무회귀

**Files:**
- Create: `clients/desktop/playwright/mobile-s3-datatable-card/mobile-s3-datatable-card.spec.ts`

- [ ] **Step 1: spec 작성** — mock(VITE_MOCK_MODE) HashRouter. `test.use({ viewport:{width:390,height:844} })`. DataTable 사용 화면(예 `/#/sales/...` 목록) goto → 로그인(mockRole) → 테이블 행이 카드로 렌더(`.tr` display:block·`td::before` 라벨 가시) 단언, 가로 overflow 0(`scrollWidth<=innerWidth`). **데스크탑 1280** 케이스: `<thead>` 가시(테이블 유지).
- [ ] **Step 2: 로컬 실행(필수)** — `cd clients/desktop && npx playwright test playwright/mobile-s3-datatable-card --workers=1 --reporter=line` → PASS.
- [ ] **Step 3: 무회귀** — DataTable 사용 기존 spec 1~2개(데스크탑 viewport) 로컬 실행 → 테이블 무회귀(예 menu-5category 등). (전체=CI mock gate.)
- [ ] **Step 4: 커밋** — `[TEST] 모바일 슬3 — DataTable 카드 mock spec(≤768px 카드+데스크탑 테이블)`

---

## Task 3: 라이브 QA(390px) + 스크린샷 보정 + dev-report

**Files:**
- Create: `clients/desktop/scripts/mobile-s3-datatable-card-qa.cjs`, `docs/qa/mobile-s3-datatable-card/`

- [ ] **Step 1: real-qa 스크립트** — Playwright(슬1/슬2 패턴). build:web→:5175. 모바일 390x844: 로그인(dev_master)→대표 리스트 화면 2~3개(판매 전표목록·회계 보고서 등 DataTable 사용)→카드 렌더·라벨-값·가로 overflow 0 캡처. 데스크탑 1280: 테이블 유지 캡처. 실 캡처 `docs/qa/mobile-s3-datatable-card/`.
- [ ] **Step 2: 캡처 확인 + 개발책임자 전달** — 스크린샷 Read + **PR 인라인/SendUserFile 로 개발책임자 전달 → 카드 모양 보정 피드백 수렴**(CSS 미세조정 반복, [[feedback_print_design_iteration]] 3~5회).
- [ ] **Step 3: dev-report** — `docs/dev-reports/2026-06-25-mobile-s3-datatable-card.md`.
- [ ] **Step 4: 커밋** — `[QA] 모바일 슬3 — DataTable 카드 라이브 캡처 + 보정`

---

## Self-Review (작성자 점검)
- **Spec 커버리지:** §3.1(방식)→T1, §3.2(레이아웃)→T1+T3 보정, §3.3(무회귀)→T1/T2, §5(검증)→T2/T3. ✅
- **Placeholder:** 없음(구체 CSS·셀렉터·명령).
- **무회귀 가드:** 카드 CSS @media 한정·데스크탑 테이블 단언(T2/T3). 2파일·Flyway 0.
- **타입 정합:** data-label/col.header 일관. 카드 클래스(.tr/.td/.td::before) Task 간 일관.
