# 모바일 슬4b — 입력 폼 1열 (공용 FormGrid) Implementation Plan

> 구현 = Codex 전담(danger-full-access·파일만 수정·git 금지, 커밋은 PM 대행 [[feedback_codex_sandbox_git]]). 🚫 Opus 임의구현 금지.
> spec: `docs/superpowers/specs/2026-06-25-mobile-s4b-form-grid-1col-design.md`.

**Goal:** 공용 반응형 `<FormGrid>`(데스크탑 N열 / ≤768px 1열) 신설 + 핵심 입력 폼 4개 이관. 데스크탑 무회귀. FE-only·Flyway 0.

**Tech:** TypeScript / React 18 / CSS Modules / design-system(@samhan/design-system) / Vitest(RTL).

## Global Constraints
- FE-only. BE/Flyway 0. 데스크탑(>768px) 시각 무회귀 최우선.
- 🔑 열 수는 **CSS 변수 `--fg-cols`** 로만 주입(인라인 `gridTemplateColumns` 금지 — @media 무력화 함정). @media(≤768px)가 `grid-template-columns:1fr` 리터럴 직접 지정.
- 한국어 주석/커밋 [[feedback_korean_commits]]. typecheck=`npm run typecheck`. design-system 변경 후 `npm run build`(dist).
- 라이브 QA = 매 리뷰 라운드 귀속(독립 Task 아님). 실서버 실캡처만.

---

## Task 1: 공용 `<FormGrid>` 컴포넌트 (design-system 신규)

**Files:**
- Create: `clients/web/design-system/src/components/FormGrid/FormGrid.tsx`
- Create: `clients/web/design-system/src/components/FormGrid/FormGrid.module.css`
- Create: `clients/web/design-system/src/components/FormGrid/FormGrid.stories.tsx`
- Test: `clients/web/design-system/src/components/FormGrid/FormGrid.test.tsx`
- Modify: `clients/web/design-system/src/index.ts` (export 추가)

- [ ] **Step 1: 테스트(실패) 작성** — `FormGrid.test.tsx`(RTL):
  - `<FormGrid>{children}</FormGrid>` 가 children 렌더 + 컨테이너에 grid 클래스 적용.
  - `columns={3}` → 컨테이너 inline style 의 `--fg-cols === '3'` (grid-template-columns 인라인 **부재** 단언).
  - `columns` 미지정 → `--fg-cols` 미설정(또는 '2') — 기본 2(CSS default).
  - `<FormGrid.Full>{x}</FormGrid.Full>` → full 클래스(grid-column span) 적용.
  - `gap='8px'` → 컨테이너 style gap 반영.
  - `className` 병합.
  - ⚠️ @media 1열 전환은 jsdom 레이아웃 부재 → **단위테스트 대상 아님**(라이브 QA 검증). 주석 명기.
- [ ] **Step 2: 실패 확인** — `cd clients/web/design-system && npx vitest run src/components/FormGrid/FormGrid.test.tsx` → FAIL(모듈 없음).
- [ ] **Step 3: FormGrid.tsx 작성**
  ```tsx
  import { type CSSProperties, type ReactNode } from 'react'
  import styles from './FormGrid.module.css'

  export interface FormGridProps {
    columns?: number      // 데스크탑 열 수(기본 2, CSS default). ≤768px 항상 1열.
    gap?: string          // gap override(기본 토큰).
    children: ReactNode
    className?: string
  }
  export function FormGrid({ columns, gap, children, className }: FormGridProps) {
    const style: CSSProperties = {}
    if (columns != null) (style as Record<string, string>)['--fg-cols'] = String(columns)
    if (gap) style.gap = gap
    const cls = [styles['grid'], className].filter(Boolean).join(' ')
    return <div className={cls} style={style}>{children}</div>
  }
  function Full({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={[styles['full'], className].filter(Boolean).join(' ')}>{children}</div>
  }
  FormGrid.Full = Full
  export default FormGrid
  ```
  - ⚠️ `grid-template-columns` 를 **inline 으로 절대 설정하지 말 것**(spec §3.1 함정). `--fg-cols` 변수만.
- [ ] **Step 4: FormGrid.module.css 작성**
  ```css
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--fg-cols, 2), minmax(0, 1fr));
    gap: var(--space-4) var(--space-3);
    width: 100%;
  }
  .full { grid-column: 1 / -1; }
  @media (max-width: 768px) {
    .grid { grid-template-columns: 1fr; }
  }
  ```
- [ ] **Step 5: index.ts export** — `export * from './components/FormGrid'` (주석: `// mobile-s4b 슬라이스 신규 — 반응형 폼 그리드(데스크탑 N열/≤768px 1열)`).
- [ ] **Step 6: 스토리** — `FormGrid.stories.tsx`: 2열 기본 + columns=3 + Full 필드 혼합 예시(FormField 자식).
- [ ] **Step 7: 테스트 통과 + 빌드** — vitest PASS + `cd clients/web/design-system && npm run build`(dist 갱신, desktop 이 file: 의존 소비).
- [ ] **Step 8: 커밋(PM 대행)** — `[FEAT] 모바일 슬4b — 공용 반응형 FormGrid 컴포넌트(데스크탑 N열/≤768px 1열)`

---

## Task 2: 핵심 입력 폼 4개 → FormGrid 이관

**Files (라인 approx — 각 파일 `gridTemplateColumns` grep 으로 실위치 확정):**
- Modify: `clients/desktop/src/renderer/routes/admin/PartnerCreatePage.tsx`
- Modify: `clients/desktop/src/renderer/routes/admin/PartnerDetailDialog.tsx` (grid 2곳)
- Modify: `clients/desktop/src/renderer/components/EditWarehouseModal.tsx`
- Modify: `clients/desktop/src/renderer/routes/accounting/SupplierProfilePage.tsx` (grid 3곳)

- [ ] **Step 1: import** — 각 파일 `import { FormGrid } from '@samhan/design-system'`.
- [ ] **Step 2: 이관 패턴** — 인라인 `<div style={{ display:'grid', gridTemplateColumns:'1fr 1fr'(또는 repeat(2,1fr)), gap:... }}>...FormField...</div>` →
  ```tsx
  <FormGrid columns={2}>...FormField...</FormGrid>
  ```
  - 전폭 필드(주소/비고/설명 등 기존 `gridColumn:'1 / -1'`) → `<FormGrid.Full>{해당 필드}</FormGrid.Full>`.
  - gap 이 기존과 크게 다르면 `gap` prop 으로 기존값 유지(데스크탑 무회귀). 동등하면 생략(토큰 기본).
  - 3열 이상 grid 는 `columns={3}` 등.
  - ⚠️ **폼-필드 grid 만 이관**. 데이터 표/품목 라인(수량·단가 표)·버튼 행·비폼 레이아웃 grid 는 **건드리지 않음**(범위 외).
- [ ] **Step 3: 데스크탑 무회귀 점검** — 각 파일 이관 후 시각 동등(열수·gap·전폭). typecheck 0.
- [ ] **Step 4: mock spec(필요 시)** — 기존 거래처/창고/공급자 mock spec 이 grid DOM 구조 단언 시 셀렉터 갱신(없으면 생략). desktop mock suite green 유지.
- [ ] **Step 5: 커밋(PM 대행)** — `[FEAT] 모바일 슬4b — 핵심 입력 폼 4개 FormGrid 이관(거래처 등록/상세·창고편집·공급자설정)`

---

## Task 3: 라이브 QA (⚠️ 매 리뷰 라운드 귀속 — 독립 Task 아님)

> 본 Task 는 구현 단계 독립 실행 금지. ④/⑤ 각 리뷰 라운드의 fix 적용 후 그 상태를 라이브 재캡처하는 게이트로 수행([[feedback_qa_docker_real_test]] · 슬4a 교훈).

**절차:**
- [ ] Docker 풀스택 up(이미 가동 — 게이트웨이 :8080). BE 무변경이라 재빌드 불요. design-system+desktop 웹빌드 `npm run build:web` → vite preview `:5175`.
- [ ] 모바일 viewport(390×844) `dev_master` 로그인 → 이관 4폼 각각: ≤768px **1열 세로 스택·가로 overflow 0** 캡처.
- [ ] 데스크탑 viewport(>768px): 이관 4폼 **2열 무회귀** 캡처(이관 전후 시각 동등).
- [ ] 전폭 필드(주소/비고) 1열·2열 전폭 확인 캡처.
- [ ] 캡처 = `scripts/mobile-s4b-*.cjs` 패턴(dev_master). 산출 `docs/qa/mobile-s4b-form-grid/`. **가짜 캡처 금지**([[feedback_no_fake_data_ever]]).
- [ ] 각 라운드 캡처 PR #(슬4b) 코멘트 인라인 게시.

---

## Self-Review (작성자 점검)
- **Spec 커버리지:** §3.1→T1, §3.2→T2, §5 검증→T3(라운드 귀속). ✅
- **함정 박제:** 인라인 grid-template-columns @media 무력화 → `--fg-cols` 변수 주입(T1 Step3/4 명시).
- **무회귀 가드:** CSS-only·Flyway 0·데스크탑 2열 시각 동등(T2 Step3)·mock suite(T2 Step4).
- **범위 규율:** 폼-필드 grid 만 이관, 표/라인/버튼 grid 제외(T2 Step2). 나머지 ~88곳 슬4b-2+.
- **라이브QA 규율:** 독립 Task 아님 — 리뷰 라운드 귀속(T3 헤더).
