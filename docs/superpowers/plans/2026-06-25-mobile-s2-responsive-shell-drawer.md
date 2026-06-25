# 모바일 슬2 반응형 셸 — Drawer 네비게이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 superpowers:executing-plans 로 task별 구현. 본 프로젝트 실 프로세스는 canonical 워크플로우([[feedback_canonical_workflow]]): 본 plan=Opus 기획. 구현=Codex(danger-full-access), Opus↔Codex 5-agent 듀얼리뷰 0수렴 후 머지.

**Goal:** ≤768px 에서 햄버거→좌측 슬라이드 Drawer 로 전체 7분류 네비를 제공하는 반응형 셸 foundation 을 구축한다(데스크탑/Electron 무회귀, FE-only, Flyway 0).

**Architecture:** `AppLayout` 에 `drawerOpen` 상태 + 헤더 햄버거 + 백드롭을 추가하고, 기존 `.app-sidebar`(7분류 RBAC nav)를 ≤768px 에서 `position:fixed` 슬라이드 Drawer 로 전환(별도 메뉴 구현 없이 재사용). 자동 닫힘(라우트 변경/ESC/백드롭/리사이즈) + a11y(focus trap·scroll lock). >768px 는 정적 그리드 사이드바 불변.

**Tech Stack:** TypeScript / React 18 / react-router-dom(useLocation) / CSS(@media) / Vitest + React Testing Library / Playwright(mock + real-qa).

## Global Constraints
- **데스크탑(>768px)·Electron 완전 무회귀** — Drawer/햄버거/백드롭 CSS 는 전부 `@media (max-width:768px)` 안에만. >768px 사이드바 정적 그리드 불변.
- **FE-only·Flyway 0·BE 무변경**.
- **기존 사이드바 nav 재사용**(SidebarCategory 7분류·RBAC 게이트 로직 무변경 — 셸 래핑만).
- 신규 testid: `app-drawer-toggle`(햄버거), `app-drawer`(컨테이너), `app-drawer-backdrop`. [[feedback_uuid_no_user_visibility]] 무관(UI).
- typecheck = `npm run typecheck`(tsconfig.node+web) [[feedback_desktop_typecheck_command]]. 신규 mock spec = 로컬 mock Playwright 실행 + ci 무회귀 검증 [[feedback_platform_branch_build_time_flag]].
- 라이브 QA = 실 캡처만 [[feedback_no_fake_data_ever]]. breakpoint = 768px 리터럴(=`--bp-md`, CSS @media var 미지원) 주석 명시.
- design-system 기존 `--bp-*` 토큰 사용, 신규 토큰 추가 금지(슬1 정합).

---

## File Structure
**FE (clients/desktop/src/renderer):**
- Modify `components/AppLayout.tsx` — drawerOpen state·햄버거·백드롭·자동닫힘·a11y(또는 로직 복잡 시 `hooks/useMobileDrawer.ts` 분리).
- Create `hooks/useMobileDrawer.ts`(선택) — drawerOpen + 자동닫힘(useLocation/ESC/resize) + scroll lock 캡슐화(AppLayout 비대 완화).
- Modify `styles/global.css` — `@media (max-width:768px)` Drawer/백드롭/햄버거/safe-area CSS.
- Modify `index.html` — viewport `viewport-fit=cover`(safe-area).
- Test `components/__tests__/AppLayout.drawer.test.tsx` — drawerOpen 토글·자동닫힘 로직(vitest+RTL).

**QA:**
- Create `playwright/mobile-s2-drawer/mobile-s2-drawer.spec.ts` — mock gate(≤768px Drawer 개폐·네비·자동닫힘·데스크탑 햄버거 미노출).
- Create `scripts/mobile-s2-responsive-qa.cjs` — real-qa(390px) 반응형 라이브 캡처.
- Create `docs/qa/mobile-s2-responsive-shell/` — 실 캡처 + README.

---

## Task 1: Drawer 상태 + 햄버거 + 백드롭 마크업 (AppLayout)

**Files:**
- Modify: `clients/desktop/src/renderer/components/AppLayout.tsx`(렌더 `:492-` 영역 + state)
- Test: `clients/desktop/src/renderer/components/__tests__/AppLayout.drawer.test.tsx`

**Interfaces:**
- Produces: AppLayout 에 `drawerOpen` 토글. 마크업 testid `app-drawer-toggle`/`app-drawer`/`app-drawer-backdrop`.

- [ ] **Step 1: 실패 테스트** — `AppLayout.drawer.test.tsx`: AppLayout 렌더(라우터/세션 mock) 시 `[data-testid=app-drawer-toggle]` 존재, 클릭 전 `.app-sidebar` 에 `is-open` 클래스 없음, 햄버거 클릭 후 `is-open` 존재 + `[data-testid=app-drawer-backdrop]` 노출. (RTL `render` + `fireEvent.click`.)
- [ ] **Step 2: 실패 확인** — `cd clients/desktop && npx vitest run src/renderer/components/__tests__/AppLayout.drawer.test.tsx` → FAIL.
- [ ] **Step 3: 구현** — AppLayout 함수에 `const [drawerOpen, setDrawerOpen] = useState(false)`. 렌더(`:493` app-shell 직하/헤더 영역)에 햄버거 `<button data-testid="app-drawer-toggle" className="app-drawer-toggle no-print" aria-label="메뉴 열기" aria-expanded={drawerOpen} aria-controls="app-drawer" onClick={() => setDrawerOpen(true)}>`(아이콘). `<aside className="app-sidebar ...">` 에 `id="app-drawer"` + `className`(기존 + `drawerOpen ? ' is-open' : ''`) + (모바일 한정) `role="dialog" aria-modal`. app-shell 내 백드롭 `<div data-testid="app-drawer-backdrop" className={'app-drawer-backdrop no-print' + (drawerOpen?' is-open':'')} onClick={() => setDrawerOpen(false)} />`. (CSS 가 ≤768px 에서만 시각화 — 마크업은 상시.)
- [ ] **Step 4: 통과 확인** — 같은 vitest → PASS. `npm run typecheck` 0.
- [ ] **Step 5: 커밋** — `[FEAT] 모바일 슬2 — Drawer 상태+햄버거+백드롭 마크업`

---

## Task 2: Drawer/백드롭 CSS (@media ≤768px) + 전환 + safe-area

**Files:**
- Modify: `clients/desktop/src/renderer/styles/global.css`(`:108` 기존 ≤768px 블록 확장)
- Modify: `clients/desktop/src/renderer/index.html`(`:13` viewport)

- [ ] **Step 1: CSS 구현** — `@media (max-width:768px)` 블록에 추가(기존 `.app-sidebar{display:none}` 제거하고 Drawer 로 전환):
```css
@media (max-width: 768px) { /* = --bp-md */
  .app-shell { grid-template-columns: 1fr; }
  .app-main { padding: var(--space-4); padding-left: max(var(--space-4), env(safe-area-inset-left));
              padding-right: max(var(--space-4), env(safe-area-inset-right)); overflow-x: hidden; }
  .app-drawer-toggle { display: inline-flex; }            /* 데스크탑 숨김(기본 none) */
  .app-sidebar {                                          /* display:none → Drawer */
    position: fixed; inset: 0 auto 0 0; z-index: 1000; width: min(280px, 85vw);
    height: 100dvh; transform: translateX(-100%); transition: transform .25s ease;
    overflow-y: auto; box-shadow: var(--shadow-lg, 0 0 24px rgba(0,0,0,.2));
    padding-top: max(var(--space-4), env(safe-area-inset-top));
  }
  .app-sidebar.is-open { transform: translateX(0); }
  .app-drawer-backdrop { position: fixed; inset: 0; z-index: 999; background: rgba(0,0,0,.45);
    opacity: 0; pointer-events: none; transition: opacity .25s ease; }
  .app-drawer-backdrop.is-open { opacity: 1; pointer-events: auto; }
}
.app-drawer-toggle { display: none; }                     /* 기본(데스크탑) 숨김 */
.app-drawer-backdrop { display: none; }
@media (max-width: 768px) { .app-drawer-backdrop { display: block; } }
@media (prefers-reduced-motion: reduce) {
  .app-sidebar, .app-drawer-backdrop { transition: none; }
}
```
  (정확한 토큰명은 기존 global.css 변수 확인 후 정합. 데스크탑 `.app-sidebar` 규칙은 `@media` 밖 불변.)
- [ ] **Step 2: viewport** — `index.html` viewport meta 에 `viewport-fit=cover` 추가(없으면).
- [ ] **Step 3: 검증** — `npm run typecheck` 0 · `npm run build:web` 0. (시각 검증은 Task 6 라이브 QA.)
- [ ] **Step 4: 커밋** — `[FEAT] 모바일 슬2 — Drawer/백드롭 CSS(@media 768px)+safe-area`

---

## Task 3: 자동 닫힘 + a11y (라우트변경/ESC/리사이즈/scroll lock/focus)

**Files:**
- Modify: `clients/desktop/src/renderer/components/AppLayout.tsx`(또는 Create `hooks/useMobileDrawer.ts` 로 분리)
- Test: `components/__tests__/AppLayout.drawer.test.tsx`(케이스 추가)

**Interfaces:**
- Consumes: Task1 `drawerOpen`/`setDrawerOpen`.
- (선택) Produces: `useMobileDrawer(): { drawerOpen, openDrawer, closeDrawer }` — useLocation 변경·ESC·resize>768px·scroll lock 캡슐화.

- [ ] **Step 1: 실패 테스트 추가** — (a) 라우트 변경(useLocation 변경) 시 `is-open` 제거 (b) `ESC` keydown 시 close (c) 백드롭/링크 클릭 시 close. (RTL: MemoryRouter 경로 변경·`fireEvent.keyDown(window,{key:'Escape'})`.)
- [ ] **Step 2: 실패 확인** — vitest → FAIL.
- [ ] **Step 3: 구현** — AppLayout(또는 useMobileDrawer):
  - `const location = useLocation(); useEffect(() => setDrawerOpen(false), [location.pathname])`(라우트 변경 close).
  - `useEffect`(drawerOpen 의존): drawerOpen 시 `document.addEventListener('keydown', onEsc)`(Escape→close) + `document.body.style.overflow='hidden'`(scroll lock), cleanup 복원.
  - `useEffect`: `window.addEventListener('resize', () => { if (window.innerWidth > 768) setDrawerOpen(false) })`(데스크탑 확대 close).
  - focus: drawerOpen 시 Drawer 첫 포커서블로 focus, 닫힘 시 햄버거로 복귀(ref). focus trap 은 최소(Tab 이 Drawer 밖으로 나가도 backdrop 가림 — MVP 는 scroll lock+focus 이동까지, 완전 trap 은 라이브 QA 키보드 확인 후 보강).
- [ ] **Step 4: 통과 + typecheck** — vitest PASS · `npm run typecheck` 0.
- [ ] **Step 5: 커밋** — `[FEAT] 모바일 슬2 — Drawer 자동닫힘(라우트/ESC/리사이즈)+scroll lock+focus`

---

## Task 4: 헤더 모바일 정합 (햄버거 배치 + 우측 overflow)

**Files:**
- Modify: `clients/desktop/src/renderer/components/AppLayout.tsx`(헤더 영역) / `styles/global.css`

- [ ] **Step 1: 구현** — 헤더(app-main 상단) 좌측에 햄버거가 ≤768px 노출(Task1 마크업이 헤더에 위치하도록 배치). 헤더 우측(사용자 드롭다운·알림·비번변경)은 ≤768px 에서 가로 overflow 없게 `@media`: `flex-wrap` 또는 라벨 축약/아이콘화·`text-overflow:ellipsis`·gap 축소. 데스크탑 헤더 무변동.
- [ ] **Step 2: 검증** — `npm run typecheck` 0 · `build:web` 0. (시각=Task6.)
- [ ] **Step 3: 커밋** — `[FEAT] 모바일 슬2 — 헤더 햄버거 배치+모바일 우측 정합`

---

## Task 5: mock Playwright spec + ci 등재 + 로컬 실행

**Files:**
- Create: `clients/desktop/playwright/mobile-s2-drawer/mobile-s2-drawer.spec.ts`

- [ ] **Step 1: spec 작성** — mock(VITE_MOCK_MODE) HashRouter. `test.use({ viewport: {width:390,height:844} })`. 시나리오: goto `/#/`(또는 mock 홈) → `[data-testid=app-drawer-toggle]` 보임 → 클릭 → `.app-sidebar.is-open` 가시 + 7분류(예 `[data-testid=sidebar-category-toggle-판매]`) 존재 → 카테고리 펼침 → 하위 NavLink 클릭 → 라우트 이동 + Drawer 자동 close(`is-open` 제거) → 재오픈 후 백드롭(`[data-testid=app-drawer-backdrop]`) 클릭 close → `ESC` close. **데스크탑 viewport(1280)** 케이스: 햄버거 미노출(`toBeHidden`)·사이드바 정적 노출.
- [ ] **Step 2: 로컬 실행(필수)** — `cd clients/desktop && npx playwright test playwright/mobile-s2-drawer --workers=1 --reporter=line` → PASS([[feedback_platform_branch_build_time_flag]] 신규 셸 변경 mock gate 검증). webServer 자동 기동(VITE_MOCK_MODE).
- [ ] **Step 3: 기존 mock 무회귀 확인** — Drawer 가 기존 spec(해시 navigate)에 영향 없는지 핵심 spec 1~2개 로컬 실행(예 `sp-09-3-ocr-receipt-shell -g T1`). (전체는 CI mock gate.)
- [ ] **Step 4: 커밋** — `[TEST] 모바일 슬2 — Drawer mock gate spec(≤768px 개폐+데스크탑 미노출)`

---

## Task 6: 라이브 QA(반응형 390px) + 데스크탑 무회귀 + dev-report

**Files:**
- Create: `clients/desktop/scripts/mobile-s2-responsive-qa.cjs`, `docs/qa/mobile-s2-responsive-shell/README.md`

- [ ] **Step 1: real-qa 스크립트** — Playwright 직접(슬1 `mobile-s1-web-qa.cjs` 패턴). 웹빌드(`build:web`)→`:5175` 서빙. 모바일 390x844: 로그인(dev_master)→홈(데스크탑 사이드바 숨김·햄버거 노출)→햄버거→Drawer 슬라이드 인 캡처→7분류 보임→카테고리 펼침→하위 이동+자동 close→백드롭/ESC close→**가로 스크롤 0**(`document.documentElement.scrollWidth<=innerWidth`) 단언. 데스크탑 1280 뷰포트: 사이드바 상시·햄버거 미노출 캡처. 실 캡처 `docs/qa/mobile-s2-responsive-shell/`.
- [ ] **Step 2: 실행 + 캡처 확인** — `node scripts/mobile-s2-responsive-qa.cjs`. 스크린샷 Read 로 실 확인(가짜 금지 [[feedback_no_fake_data_ever]]).
- [ ] **Step 3: dev-report** — `docs/dev-reports/2026-06-25-mobile-s2-responsive-shell.md`(데이터 흐름·검증).
- [ ] **Step 4: 커밋** — `[QA] 모바일 슬2 — 반응형 390px Drawer 라이브 캡처 + 데스크탑 무회귀`

---

## Self-Review (작성자 점검)
- **Spec 커버리지:** §3.1(셸/safe-area)→T2/T4, §3.2(Drawer)→T1/T2/T3, §3.3(헤더)→T4, §3.4(토큰)→T2, §5(검증)→T5/T6. ✅ 전 항목 매핑.
- **Placeholder:** 없음(각 Task 구체 파일·CSS·검증 명령).
- **무회귀 가드:** 모든 Drawer CSS `@media (max-width:768px)` 한정·데스크탑 정적 그리드 불변(T2). FE-only·Flyway 0.
- **mock gate 교훈 반영:** 신규 셸 변경 → T5 로컬 mock Playwright 필수([[feedback_platform_branch_build_time_flag]] 슬1 회귀 재발 방지).
- **타입 정합:** drawerOpen/setDrawerOpen(또는 useMobileDrawer) 명칭 T1 정의·T3 일관. testid app-drawer-toggle/app-drawer/app-drawer-backdrop 전 Task 일관.
