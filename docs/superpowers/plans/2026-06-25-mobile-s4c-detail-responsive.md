# 모바일 슬4c — 상세 페이지 반응형 Implementation Plan

> 구현 = Codex 전담(danger-full-access·파일만·git PM 대행 [[feedback_codex_sandbox_git]]). 🚫 Opus 임의구현 금지.
> spec: `docs/superpowers/specs/2026-06-25-mobile-s4c-detail-responsive-design.md`.

**Goal:** 상세 페이지 9종 모바일(≤768px) 라벨-값 1열 + 가로 overflow 0. 데스크탑 무회귀. FE-only·Flyway 0.

## Global Constraints
- FE-only. BE/Flyway 0. 데스크탑(>768px) 시각 무회귀 최우선(CSS-only).
- 🔑 전역 CSS 클래스(`.detail-grid`)는 @media 가능. 인라인 `gridTemplateColumns`는 @media 무력화 → 슬4b `FormGrid` 재사용(신규 컴포넌트 지양).
- 한국어 주석. typecheck=`npm run typecheck`. 라이브 QA=리뷰 라운드 귀속·실캡처.

---

## Task 1: 전역 `.detail-grid` / `.batch-detail-meta` 반응형 (1변경 → 9페이지)

**Files:** Modify `clients/desktop/src/renderer/styles/global.css`

- [ ] **Step 1:** `global.css`에서 `.detail-grid`(약 353줄) 정의 확인 + `.batch-detail-meta` 위치 확인.
- [ ] **Step 2:** `@media (max-width: 768px)` 블록 추가(기존 768px @media 블록 있으면 합치고, 없으면 신규):
  ```css
  @media (max-width: 768px) {
    .detail-grid { grid-template-columns: 1fr; }
    .batch-detail-meta { grid-template-columns: 1fr; }
  }
  ```
  데스크탑 auto-fit 규칙은 불변.
- [ ] **Step 3:** typecheck 0 + desktop 빌드 확인(`npm run build:web` 또는 typecheck).
- [ ] **Step 4: 커밋(PM 대행)** — `[FEAT] 모바일 슬4c — 상세 메타 .detail-grid 모바일 1열(@media, 9페이지 공용)`

---

## Task 2: 상세 페이지 인라인 grid 잔여 반응형 (페이지별 — grep 기반)

**Files:** `clients/desktop/src/renderer/routes/{SlipDetailPage,SalesPartnerOrderDetailPage,JournalDetailPage,TaxInvoiceDetailPage,EstimateDetailPage,GroupwareApprovalDetailPage,TransferDetailPage,InventoryAuditDetailPage}.tsx`, `routes/components/BatchDetailModal.tsx`

- [ ] **Step 1: grep** — 위 9파일에서 `gridTemplateColumns`(인라인) 전수 검출 + 각 용도 분류(폼/메타 다열 vs 합계·금액 정렬 행 vs 데이터 표 vs 버튼 행).
- [ ] **Step 2: 폼/메타 성격 다열 인라인 grid** → `import { FormGrid } from '@samhan/design-system'` 후 `<FormGrid columns={N}>`(슬4b) 이관. 전폭=`<FormGrid.Full>`.
- [ ] **Step 3: 합계/금액 정렬 행**(예 `TaxInvoiceDetailPage` 합계 258~309) — 1열 강제가 어색하면 이관하지 말고, 모바일 가로 overflow만 방지(`max-width:100%`/`overflow-x:auto` 또는 flex wrap). 우측정렬·의미 보존.
- [ ] **Step 4: 데이터 표/버튼 행/라인아이템** = 건드리지 말 것(라인 표는 슬3 공용 DataTable 카드화로 대응; 비-DataTable 커스텀 표만 깨지면 별도 표기).
- [ ] **Step 5:** typecheck 0. 데스크탑 무회귀.
- [ ] **Step 6: 커밋(PM 대행)** — `[FEAT] 모바일 슬4c — 상세 페이지 인라인 grid 반응형(FormGrid 이관/overflow 가드)`

---

## Task 3: 라이브 QA (⚠️ 매 리뷰 라운드 귀속)

- [ ] Docker 풀스택 up(:8080)·`npm run build:web`→`:5175` preview. design-system 변경 시 `npm run build`(dist).
- [ ] 모바일 viewport(390×844) `dev_master` 로그인 → 진입 가능한 상세 페이지(시드/생성 데이터)별: 메타 **1열 세로 스택·가로 overflow 0** 캡처. computed grid 트랙수 측정(ground-truth).
- [ ] 데스크탑(>768px): 동일 페이지 **무회귀**(auto-fit 다열) 캡처.
- [ ] 캡처 = `clients/desktop/scripts/mobile-s4c-detail-qa.cjs`(슬4b 스크립트 패턴 복제·detail 라우트/데이터 적응). 산출 `docs/qa/mobile-s4c-detail-responsive/`. **가짜 금지** — 데이터 없어 진입 불가 페이지는 "캡처 불가+사유" 정직 기록.
- [ ] 각 라운드 fix 후 라이브 재캡처 게시.

---

## Self-Review
- **Spec 커버리지:** §3.1→T1, §3.2→T2, §5 검증→T3. ✅
- **레버리지:** `.detail-grid` 전역 @media 1변경=9페이지(슬3 패턴). 인라인만 FormGrid(슬4b 재사용). 신규 컴포넌트 0.
- **무회귀:** CSS-only·Flyway 0·데스크탑 auto-fit 불변·데이터표/합계행 보존.
- **검증:** 상세 데이터 의존 → 라이브 QA에서 실 데이터 진입, 불가 페이지 정직 보고.
