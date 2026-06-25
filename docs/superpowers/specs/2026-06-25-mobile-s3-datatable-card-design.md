# 모바일 에픽 슬3 — DataTable 모바일 카드화 (설계)

> 작성: 2026-06-25 · 에픽: ② "데스크탑을 모바일로(전 직원용)" · 상위: 슬2 반응형 셸 Drawer(PR #597 머지)
> 상태: **brainstorming 설계 확정(개발책임자 "우선 진행, 스크린샷 추후 보정") → spec 검토 후 writing-plans**

## 0. 개발책임자 결정 (확정)
- 슬3 범위 = **공용 DataTable 모바일 카드화 집중**(폼/모달=슬4 분리). 57개 화면이 DataTable 사용 → 컴포넌트 1개 변경으로 전 리스트 화면 모바일 사용성 개선.
- **카드 모양/라벨/간격은 라이브 QA 스크린샷으로 추후 반복 보정**([[feedback_print_design_iteration]] — UI 단번완성 금지, 캡처→CSS 미세조정 3~5회).

## 1. 목표 / 비목표
**슬3 목표:**
- 공용 `DataTable` 을 ≤768px(`--bp-md`)에서 **행=카드**로 렌더(각 컬럼=라벨-값 행). 57개 리스트 화면이 모바일에서 가로 overflow 없이 읽힘.
- **데스크탑(>768px)·인쇄(@media print) 완전 무변동.** FE-only·Flyway 0.
- CSS-only(컴포넌트 변경 최소 — `data-label` 1개) 로 전 화면 자동 적용.

**슬3 비목표 (후속 슬라이스):**
- 화면별 폼 1열·입력 컴포넌트 모바일 = **슬4**.
- 모달 풀스크린·상세 화면 반응형 = 슬4+.
- 컬럼별 모바일 우선순위/숨김(per-column mobile-hide) = 후속(필요 시 신규 prop). 슬3 은 전 컬럼 라벨-값 표시.
- print 링크 platform-aware 헬퍼 = 슬4.

## 2. 정찰 근거 (file:line)
- 공용 컴포넌트: `clients/web/design-system/src/components/DataTable/DataTable.tsx`(`columns: DataTableColumn<T>[]`{key·header·render?·width·align} + `rows`·`rowKey`·`onRowClick`·`loading`·`emptyMessage`). `<table>` 렌더: `colgroup`+`thead`(th)+`tbody`(tr×td, 셀=`col.render(row)` 또는 defaultCell). loading=MascotLoader, empty=MascotEmptyState.
- 스타일: `DataTable.module.css` `.wrapper`(overflow hidden)·`.scroll`(overflow:auto 가로스크롤)·`.table`·`.thead`(sticky)·`.tr`(hover)·`.td`·`.th`. **반응형 @media 없음**.
- 사용처: `clients/desktop/src/renderer` 57개 화면(회계 보고서·전표 목록·배차·재고 등). 슬2에서 셸 ≤768px Drawer·`.app-main overflow-x:hidden` 적용됨(테이블 내부는 미카드화 — 본 슬라이스 대상).

## 3. 설계

### 3.1 카드화 방식 (CSS-only)
- **`DataTable.tsx`**: 각 `<td>` 에 `data-label={col.header}` 추가(헤더 텍스트를 셀에 부착 — 유일한 TSX 변경). 빈 헤더 컬럼은 `data-label=""`(카드에서 라벨 없이 값 풀폭).
- **`DataTable.module.css`** `@media (max-width:768px)` 신규 블록:
  - `.scroll{ overflow: visible }`(가로스크롤 해제), `.table, .thead, .tbody, .tr, .td{ display:block }`(테이블 레이아웃 해제).
  - `.thead{ position:absolute; clip ... }`(헤더 시각 숨김·접근성 보존) — 또는 `display:none`(슬3 단순).
  - `.tr`: **카드** — `border:1px solid var(--color-neutral-200); border-radius: var(--radius-md); padding: var(--space-3); margin-bottom: var(--space-2); background: var(--color-bg-surface); box-shadow: var(--shadow-sm)`. hover/clickable 보존.
  - `.td`: `display:flex; justify-content:space-between; gap: var(--space-3); padding: var(--space-1) 0; border:none; text-align:left`. **`.td::before{ content: attr(data-label); font-weight:600; color: var(--color-neutral-500); flex-shrink:0 }`**(좌측 라벨). 값은 우측(`text-align:right` 또는 `margin-left:auto`).
  - 빈 라벨(`data-label=""`) `.td::before{ content:none }` → 값 풀폭(액션 버튼 영역).
  - `.alignRight/.alignCenter` 모바일에서는 값 우측 정렬 유지(라벨-값 패턴).
- (정확한 토큰명·셀렉터는 기존 module.css 변수/구조 확인 후 정합. 카드 색/간격/라벨은 §0대로 스크린샷 보정.)

### 3.2 카드 레이아웃 (모바일 한 행 = 한 카드)
```
┌──────────────────────────┐
│ 전표번호      2026/06/25-1 │
│ 거래처              삼한    │
│ 금액             1,200,000 │
│ 상태               [처리중] │
└──────────────────────────┘
```
- 각 컬럼 = "라벨: 값" 1행(라벨 좌측 회색 600, 값 우측). 복잡 render(버튼/배지/링크)는 값 영역에 그대로(flex 우측). `onRowClick` → 카드 전체 클릭(cursor pointer). loading 오버레이·empty(MascotEmptyState) 유지.

### 3.3 무회귀
- 변경 = `DataTable.tsx`(+data-label) + `DataTable.module.css`(+@media 블록) **2파일**. 데스크탑(>768px) 규칙 불변(신규는 @media max-width:768px 한정). `@media print` 무수정. design-system Storybook DataTable 데스크탑 무변동.

## 4. 데이터 흐름 / 컴포넌트
- DataTable 렌더 로직(columns/rows map) 무변경 — `<td>` 에 data-label 속성만 추가. CSS 가 ≤768px 에서 시각 변환. 57개 소비처는 코드 변경 0(자동 적용).

## 5. 검증 (라이브 QA, [[feedback_no_fake_data_ever]])
- **mock gate(Desktop Playwright)**: DataTable 변경이 기존 57화면 mock spec(데스크탑 viewport=테이블 유지) 무회귀 — 로컬 mock Playwright 필수([[feedback_platform_branch_build_time_flag]]). 신규 카드 spec 1개(≤768px viewport 에서 DataTable 사용 화면 카드 렌더·라벨 표시).
- **반응형 라이브 QA(웹, 390px)**: 대표 리스트 화면 2~3개(예 판매 전표목록·회계 보고서) 카드 렌더·라벨-값·가로 overflow 0 실 캡처 → **개발책임자에 스크린샷 전달 → 카드 모양 반복 보정**(CSS 미세조정).
- **데스크탑 무회귀**: >768px 테이블 그대로 캡처. Storybook DataTable.
- typecheck 0 · vitest · build:web 0.

## 6. 리스크 / 완화
| 리스크 | 완화 |
|---|---|
| 데스크탑 테이블 회귀(@media 누수) | 모든 카드 CSS @media(max-width:768px) 한정, >768px 테이블 단언(라이브·mock) |
| 인쇄(@media print) 파손 | print 무수정, 인쇄 QA([[feedback_print_design_iteration]]) |
| 57화면 중 특이 render(넓은 셀·중첩표) 카드 깨짐 | 라이브 QA 대표 화면 + 스크린샷 보정, 필요 시 per-column 후속 |
| 빈 헤더/액션 컬럼 라벨 어색 | data-label="" → content:none 값 풀폭 |
| mock gate 회귀(슬1/슬2 교훈) | 로컬 mock Playwright + 카드 spec 등재 |

## 7. 슬라이스 경계 (단일 PR)
슬3 = `DataTable.tsx`(data-label) + `DataTable.module.css`(@media 카드) + 카드 mock spec + 라이브 QA(스크린샷 보정). Flyway 0·BE 무변경. 후속: 슬4(폼 1열·모달 풀스크린·화면별)·per-column mobile-hide·PWA.
