# 모바일 에픽 슬2 — 반응형 셸: Drawer 네비게이션 (설계)

> 작성: 2026-06-25 · 에픽: ② "데스크탑을 모바일로(전 직원용)" · 상위: 슬1 Foundation([2026-06-25-mobile-s1-foundation-auth-web-deploy-design.md](2026-06-25-mobile-s1-foundation-auth-web-deploy-design.md), PR #596 머지)
> 상태: **brainstorming 설계 확정(개발책임자 승인) → spec 검토 후 writing-plans**

## 0. 개발책임자 결정 (확정)
- 모바일 네비 = **Drawer-only**(하이브리드 하단탭 제안 → 개발책임자 "모두 서랍으로" 정정). 깊은 7분류 계층 IA 그대로 보존.
- 범위 = **셸 + 네비 foundation**. 테이블 카드화·화면별 폼/테이블 반응형·PWA = **슬3+**.
- 모바일 최종 배포 = iOS/Android 하이브리드 WebView(슬1 박제). 본 반응형 웹이 WebView 쉘 내용.

## 1. 목표 / 비목표
**슬2 목표 (반응형 셸 foundation):**
- ≤768px(`--bp-md`)에서 **햄버거 → 좌측 슬라이드 Drawer**로 전체 7분류 네비 제공(슬1이 사이드바 `display:none` 하고 네비를 비워둔 갭 해소).
- Drawer = 기존 `.app-sidebar` `<nav>`(SidebarCategory 7분류 접이식·RBAC 게이트) **그대로 재사용**.
- 전역 반응형 셸 골격(@media `--bp-md` 기준·viewport safe-area·`overflow-x` 방지) + 홈·대표 화면 1~2개 모바일 구동 검증(가로 overflow 0 수준 최소 정합).
- **데스크탑(>768px) 완전 무회귀**(사이드바 상시 그리드 불변). **Electron 무회귀**.

**슬2 비목표 (후속 슬라이스):**
- 화면별 테이블 카드화(공용 DataTable 모바일 카드) = **슬3**.
- 화면별 폼 1열·모달 풀스크린·상세 화면 반응형 = 슬3+.
- PWA(manifest/Service Worker/오프라인/설치) = 후속(하이브리드 WebView 가 앱 패키징 담당).
- 하단탭 바 = 폐기(개발책임자 Drawer-only 결정).
- 역할 적응형 네비(롤별 노출 최적화) = 후속 가능 항목(슬2는 기존 RBAC 게이트 그대로).

## 2. 정찰 근거 (file:line)
- 셸 렌더: `components/AppLayout.tsx:493` `<div className="app-shell">` → `:494` `<aside className="app-sidebar no-print">`(`<h1>Samhan Public</h1>` + `:496 <nav>`: 홈/알림 + `SidebarCategory`×7[판매/구매/회계/그룹웨어/인사/배차/창고운영]) + `.app-main`(Outlet). 헤더는 app-main 영역.
- 슬1 반응형: `styles/global.css:108-124` `@media (max-width:768px){ .app-shell{grid-template-columns:1fr} .app-sidebar{display:none} .app-main{padding;overflow-x:hidden} }` — **네비 대체 없음**(슬2 대상).
- 기본 그리드: `.app-shell{grid-template-columns:240px 1fr}`(`global.css:48-52`). viewport meta = `index.html:13`(존재).
- breakpoint 토큰: design-system `tokens.css:182-186` `--bp-sm 640/--bp-md 768/--bp-lg 1024/--bp-xl 1280/--bp-2xl 1536`(informational, JS/주석용).
- 라우터: 슬1에서 `routes/index.tsx` 빌드타임 `VITE_PLATFORM==='web'` 분기(웹=BrowserRouter / Electron·mock=HashRouter). Drawer 는 라우팅 무관(additive).

## 3. 설계

### 3.1 반응형 셸 (breakpoint 골격)
- 기준 = `--bp-md`(768px). ≤768px: `.app-shell` 단일컬럼(기존)·`.app-main` `padding`+`overflow-x:hidden`(기존) 유지 + **safe-area** (`padding`에 `env(safe-area-inset-*)` 가산, 노치/홈바). `index.html` viewport 에 `viewport-fit=cover` 확인·보강.
- >768px = 기존 240px 사이드바 그리드 **완전 불변**(드로어/햄버거 미렌더).
- 신규 반응형 CSS 는 `@media (max-width:768px)` 단일 블록에 모으고, 인쇄(`@media print`)·기존 화면 cascade 무파손([[feedback_print_design_iteration]] 인쇄 cascade 보존).

### 3.2 Drawer (전체 네비)
- 신규 상태: AppLayout 에 `drawerOpen` (useState). ≤768px 에서만 의미.
- **햄버거 버튼**(헤더 좌측, `data-testid="app-drawer-toggle"`, `aria-label`/`aria-expanded`/`aria-controls`): ≤768px 만 노출(CSS `@media` 또는 플랫폼 무관 CSS-only 노출). 클릭 → `drawerOpen=true`.
- **Drawer 컨테이너**: 기존 `.app-sidebar` `<aside>` 를 **그대로 사용**하되, ≤768px 에서 `position:fixed; left:0; top:0; height:100dvh; transform:translateX(-100%)` 기본·`.is-open` 시 `translateX(0)` + transition. `<nav>`(SidebarCategory 7분류·RBAC·접이식)는 **재사용**(별도 메뉴 구현 없음). `role="dialog"`/`aria-modal="true"`(모바일 한정), `id` 로 햄버거 `aria-controls` 연결.
- **Backdrop**: 신규 `.app-drawer-backdrop`(dim, `position:fixed; inset:0`), `.is-open` 시 노출. 클릭 → `drawerOpen=false`.
- **자동 닫힘**: (a) 백드롭 탭 (b) `ESC` keydown (c) **라우트 변경**(NavLink 클릭 시 `useLocation` 변경 감지 → close) (d) 뷰포트 >768px 로 확대 시 close(리사이즈/회전). (e) Drawer 내 링크 onClick close.
- **접근성/UX**: 열림 시 `body` scroll lock(overflow hidden), focus 를 Drawer 로 이동(첫 포커서블) + focus trap(Tab 순환), 닫힘 시 햄버거로 focus 복귀. `prefers-reduced-motion` 시 transition 제거.
- **데스크탑(>768px)**: `drawerOpen`/햄버거/백드롭 전부 미적용 — 사이드바는 정적 그리드 컬럼(현행). transform/fixed 미적용(CSS `@media` 가드).

### 3.3 헤더 조정
- 헤더(app-main 상단)에 ≤768px 햄버거 노출(좌측). 기존 헤더 우측(사용자 드롭다운·알림·비번변경)은 모바일 폭에서 가로 overflow 없게 정합(아이콘화/축약·`flex-wrap` 또는 우선순위 hide). 라벨 텍스트 길면 `text-overflow:ellipsis`.
- 데스크탑 헤더 = 무변동.

### 3.4 반응형 토큰/유틸 (최소)
- design-system `tokens.css` 기존 `--bp-*` 표준 사용(신규 토큰 추가 안 함, 슬1 정합). @media 는 768px 리터럴(CSS @media 는 var 미지원) + 주석에 `--bp-md` 명시.
- 공통 모바일 헬퍼 CSS(`.is-mobile-hidden`/`.is-mobile-only`)는 필요한 최소만(슬3 카드화에서 확장).

## 4. 데이터 흐름 / 컴포넌트
- AppLayout: `drawerOpen` state + `useLocation`(라우트 변경 close) + resize 리스너(>768px close). 햄버거/백드롭/aside 의 className 토글(`is-open`). 라우팅·인증·RBAC·SidebarCategory 로직 **무변경**(셸 래핑만).
- 신규 파일 최소화: 가능하면 AppLayout.tsx + global.css 안에서 처리(별도 Drawer 컴포넌트는 AppLayout 비대 시 분리 검토). a11y/포커스 트랩이 복잡하면 `components/MobileDrawer.tsx`(또는 useDrawer 훅)로 분리해 단일 책임 유지.

## 5. 검증 (라이브 QA, [[feedback_no_fake_data_ever]])
- **mock gate(Desktop Playwright)**: Drawer 는 additive·HashRouter/라우팅 무관 → 기존 mock spec 무회귀 예상. **로컬 mock Playwright 실행 필수**([[feedback_platform_branch_build_time_flag]] — 신규 셸 변경은 mock gate 검증). 신규 testid(`app-drawer-toggle`) mock spec 1개(≤768px viewport 에서 햄버거→Drawer 개폐→NavLink 이동→자동 close) 추가.
- **반응형 라이브 QA(웹, 390x844)**: Playwright(`scripts/` 재사용) — 로그인→홈(데스크탑 사이드바 숨김·햄버거 노출 확인)→햄버거 탭→Drawer 슬라이드 인·7분류 노출→카테고리 펼침→하위 NavLink 탭→이동+Drawer 자동 close→백드롭/ESC close→가로 스크롤 0. 실 캡처 다수 `docs/qa/mobile-s2-responsive-shell/`.
- **데스크탑/Electron 무회귀**: >768px 뷰포트(또는 Electron) 사이드바 상시 노출·햄버거 미노출·그리드 불변 캡처.
- typecheck 0 · build:web 0 · vitest(영향 시).

## 6. 리스크 / 완화
| 리스크 | 완화 |
|---|---|
| 데스크탑 사이드바 회귀(transform/fixed 누수) | 모든 Drawer CSS 를 `@media (max-width:768px)` 안에만. >768px 정적 그리드 단언(라이브) |
| 인쇄/기존 화면 cascade 파손 | @media print 무수정·신규는 max-width 블록 한정, 인쇄 QA([[feedback_print_design_iteration]]) |
| mock gate 회귀(슬1 라우터 교훈) | 로컬 mock Playwright 필수 + 신규 Drawer spec 등재([[feedback_platform_branch_build_time_flag]]) |
| 헤더 우측 모바일 overflow | flex-wrap/아이콘화, 390px 라이브 QA 가로 overflow 0 단언 |
| Drawer a11y(focus trap/scroll lock) 미흡 | aria-modal·focus trap·body lock·reduced-motion, 키보드 QA |
| AppLayout 비대(이미 큼) | Drawer 로직 useDrawer 훅/MobileDrawer 분리로 단일 책임 |

## 7. 슬라이스 경계 (단일 PR)
슬2 = §3.1~3.4(반응형 셸 골격 + Drawer 네비 + 헤더 햄버거 + 최소 토큰). Flyway 0·BE 무변경(FE-only). 후속: 슬3(DataTable 카드화·화면별 반응형)·PWA·하이브리드 WebView 패키징.
