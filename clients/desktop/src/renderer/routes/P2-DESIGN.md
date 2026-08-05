# P2 (4건 통합) UI 디자인 가이드

> 작성일: 2026-05-11
> 담당: Designer (SamhanLogis 디자인 시스템 기준)
> 적용 브랜치: `feature/p2-integrated-design`
> 산출물 경로: `clients/desktop/src/renderer/routes/P2-DESIGN.md`

---

## 0. 공통 원칙

- **raw hex 완전 금지**: 모든 색상은 design-system CSS 변수 토큰만 사용. 위반 시 PR CI 실패 (PR #134~#147 회고).
- **UUID 비공개**: 화면 어디에도 UUID 노출 금지. 식별자는 `estimateNo` / `periodDate` / `modelCode` / `auditNo` 등 비즈니스 키만 표시 (`feedback_uuid_no_user_visibility.md`).
- **data-testid 의무**: 모든 인터랙티브 요소와 데이터 컨테이너에 `data-testid` 부여 (PR #134~#147 회고).
- **Status Badge 토큰 사용**: 상태 표현은 design-system `<Badge>` 컴포넌트 + variant 토큰. raw 색상 인라인 금지 (PR #139 회고).
- **Role 풀네임**: `MASTER` / `MANAGER` / `SALES` / `ACCOUNTANT` / `WAREHOUSE` — 약어(M/M) 금지.
- **Pretendard 9 weight 자동 상속**: `body { font-family: var(--font-family-sans) }` 선언으로 전체 화면 자동 적용.
- **한국어 타이포**: 본문 14px Regular / 헤더 18px SemiBold / 서브헤더 16px Medium.
- **이카운트 참조**: `docs/migration/ecount-reference/` 16 캡처 — 견적/판매입력/마감/재고 화면 필드 구성 준용.
- **인쇄 양식 반복 정정**: `feedback_print_design_iteration.md` 가드 준수 — 인쇄 양식은 단번 완성 금지, 3~5회 iteration 의무.

---

## 0.1 컬러 토큰 전체 참조표

| 용도 | CSS 토큰 | 비고 |
|---|---|---|
| 배경 (카드) | `var(--surface-card)` | |
| 배경 (subtle) | `var(--surface-subtle)` | 읽기 전용 필드 |
| 배경 (hover) | `var(--surface-hover)` | |
| 경계선 (기본) | `var(--line-default)` | |
| 경계선 (focus) | `var(--line-focus)` | |
| 본문 텍스트 | `var(--ink-primary)` | |
| 보조 텍스트 | `var(--ink-secondary)` | |
| 3차 텍스트 | `var(--ink-tertiary)` | |
| Brand (Primary CTA) | `var(--color-brand-600)` | |
| 성공/완료 | `var(--state-success)` | |
| 성공 배경 | `var(--state-success-bg)` | |
| 경고/미결재 | `var(--state-warning)` | |
| 경고 배경 | `var(--state-warning-bg)` | |
| 오류/취소 | `var(--state-danger)` | |
| 오류 배경 | `var(--state-danger-bg)` | |
| 정보 | `var(--state-info)` | |
| 정보 배경 | `var(--state-info-bg)` | |
| 테이블 헤더 배경 | `var(--color-neutral-50)` | |
| 테이블 헤더 텍스트 | `var(--ink-secondary)` | |
| 합계 행 배경 | `var(--color-neutral-100)` | |
| 합계 행 텍스트 | `var(--color-neutral-900)` | |
| 최종합계 행 배경 | `var(--color-neutral-900)` | |
| 최종합계 행 텍스트 | `var(--color-neutral-0)` | |
| 음수 금액 | `var(--color-danger)` | |

---

## 0.2 타이포그래피 스케일 (공통)

| 요소 | 토큰 | 값 |
|---|---|---|
| 페이지 제목 | `var(--font-page-title)` / `var(--font-weight-semibold)` | 24px / 600 |
| 모달 제목 | `var(--font-modal-title)` / `var(--font-weight-semibold)` | 18px / 600 |
| 섹션 제목 | `var(--font-size-lg)` / `var(--font-weight-semibold)` | 16px / 600 |
| 카드 제목 | `var(--font-card-title)` / `var(--font-weight-semibold)` | 16px / 600 |
| 테이블 헤더 | `var(--font-size-xs)` / `var(--font-weight-semibold)` | 12px / 600 |
| 테이블 본문 | `var(--font-size-sm)` / `var(--font-weight-regular)` | 13px / 400 |
| 숫자 셀 | `var(--font-size-sm)` + `font-variant-numeric: tabular-nums` | 13px |
| 필드 레이블 | `var(--font-size-sm)` / `var(--font-weight-medium)` | 13px / 500 |
| 힌트/설명 | `var(--font-size-xs)` / `var(--font-weight-regular)` | 12px / 400 |
| 에러 메시지 | `var(--font-size-xs)` / `var(--font-weight-regular)` | 12px / 400 |
| Badge 텍스트 | `var(--font-size-xs)` / `var(--font-weight-semibold)` | 12px / 600 |
| 인쇄 본문 | `var(--print-text-sm)` | 11pt |
| 인쇄 헤더 | `var(--print-text-md)` | 12pt |
| 인쇄 제목 | `var(--print-text-lg)` | 18pt |

---

## 1. 견적서 (EstimateDetailPage + EstimatePrintLayout)

> 이카운트 참조: `docs/migration/ecount-reference/20260509_091707.png` (판매견적 입력)

### 1.1 페이지 구성 개요

| 항목 | 내용 |
|---|---|
| 라우트 (목록) | `/sales/estimates` |
| 라우트 (작성/편집) | `/sales/estimates/new` / `/sales/estimates/:id/edit` |
| 라우트 (상세) | `/sales/estimates/:id` |
| 라우트 (인쇄) | `/sales/estimates/:estimateNumber/print` |
| 접근 권한 | `SALES` / `MANAGER` / `MASTER` |
| data-testid 루트 | `estimate-detail-page` (상세), `estimate-form-page` (작성/편집) |

---

### 1.2 목록 화면 레이아웃 ASCII Mockup

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [h1] 견적서 관리                                          [+ 신규 작성]          │
│  ─────────────────────────────────────────────────────────────────────────────── │
│  상태 [전체 ▼]   기간 시작 [날짜]   기간 종료 [날짜]   거래처명 [검색...]          │
│  ─────────────────────────────────────────────────────────────────────────────── │
│                                                                                  │
│  ┌────────────┬────────────────┬────────────┬────────────┬──────────┬─────────┐  │
│  │ 견적번호    │ 거래처          │ 작성일      │ 유효기간    │ 합계     │ 상태    │  │
│  ├────────────┼────────────────┼────────────┼────────────┼──────────┼─────────┤  │
│  │ EST-240001 │ (주)ABC냉동    │ 2026-05-01 │ 2026-05-31 │ ₩3,200,000 │ 발송완료 │  │
│  │ EST-240002 │ 한국빌딩관리   │ 2026-05-03 │ 2026-06-02 │ ₩1,540,000 │ 작성중  │  │
│  │ EST-240003 │ (주)신라에어   │ 2026-05-05 │ 2026-06-04 │ ₩8,770,000 │ 수주완료 │  │
│  └────────────┴────────────────┴────────────┴────────────┴──────────┴─────────┘  │
│                                                   전체 3건                        │
└──────────────────────────────────────────────────────────────────────────────────┘
```

#### 1.2.1 상태 Badge 매핑

| BE 상태 | Badge variant | 표시 라벨 |
|---|---|---|
| `QUOTE_DRAFT` | `neutral` | 작성중 |
| `QUOTE_SENT` | `brand` | 발송완료 |
| `QUOTE_ACCEPTED` | `success` | 수주완료 |
| `QUOTE_REJECTED` | `danger` | 거절 |
| `QUOTE_CONVERTED` | `warning` | 슬립변환완료 |

#### 1.2.2 목록 data-testid

| data-testid | 요소 |
|---|---|
| `estimate-new-button` | [+ 신규 작성] `<button>` |
| `estimate-list-filter` | 필터 바 래퍼 `<div>` |
| `estimate-list-filter-status` | 상태 `<select>` |
| `estimate-list-filter-start` | 기간 시작 `<input type="date">` |
| `estimate-list-filter-end` | 기간 종료 `<input type="date">` |
| `estimate-list-filter-partner` | 거래처명 검색 `<input>` |
| `estimate-list-table` | 목록 DataTable 래퍼 `<div>` |

---

### 1.3 상세 화면 레이아웃 ASCII Mockup

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [h1] 견적서 상세 — EST-240001              [편집]  [발송]  [수락]  [거절]  [인쇄] │
│  ─────────────────────────────────────────────────────────────────────────────── │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  견적번호: EST-240001     상태: ● 발송완료                                │   │
│  │  거래처:   (주)ABC냉동    사업자번호: 123-45-67890                        │   │
│  │  작성일:   2026-05-01     유효기간:   2026-05-31                          │   │
│  │  담당자:   홍길동 (SALES)                                                 │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  품목명 (모델코드)  │  규격   │ 수량 │   단가   │  공급가액  │  세액  │ 소계  │   │
│  ├────────────────────┼─────────┼──────┼──────────┼────────────┼────────┼───────┤   │
│  │  에어핸들링유닛     │  4HP    │    2 │ 1,200,000│  2,400,000 │240,000 │2,640,000│   │
│  │  팬코일유닛        │  2HP    │    1 │   500,000│    500,000 │ 50,000 │  550,000│   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│                                   공급가액 합계:     2,900,000원                 │
│                                   부가세  합계:       290,000원                  │
│                                   ─────────────────────────────────────────      │
│                                   총    합:         3,190,000원                  │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

#### 1.3.1 상세 헤더 영역 CSS spec

```css
.estimate-detail-header {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3) var(--space-8);
  padding: var(--space-5);
  border: 1px solid var(--line-default);
  border-radius: var(--radius-card);
  background: var(--surface-card);
  margin-bottom: var(--space-4);
}

.estimate-detail-meta-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--ink-secondary);
  min-width: 80px;
}

.estimate-detail-meta-value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-regular);
  color: var(--ink-primary);
}
```

#### 1.3.2 라인 테이블 컬럼 구성

| 컬럼 | 데이터 필드 | 너비 | 정렬 | 비고 |
|---|---|---|---|---|
| 품목명 (모델코드) | `modelName` | flex 1 | left | UUID 미노출 — modelName만 표시 |
| 규격 | `specification` | `100px` | left | |
| 수량 | `quantity` | `70px` | right | `tabular-nums` |
| 단가 | `unitPrice` | `120px` | right | `tabular-nums` / KRW 포맷 |
| 공급가액 | `supplyAmount` | `130px` | right | `tabular-nums` / KRW 포맷 |
| 세액 (10%) | `vatAmount` | `110px` | right | `tabular-nums` / KRW 포맷 |
| 소계 | `lineTotal` | `130px` | right | `tabular-nums` / KRW 포맷 / `font-weight: semibold` |

#### 1.3.3 합계 박스 CSS spec

```css
.estimate-totals-box {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-5);
  border-top: 2px solid var(--line-default);
  margin-top: var(--space-2);
}

.estimate-total-row {
  display: flex;
  gap: var(--space-6);
  font-size: var(--font-size-sm);
  color: var(--ink-secondary);
}

.estimate-total-label {
  min-width: 120px;
  text-align: right;
}

.estimate-total-amount {
  min-width: 160px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--ink-primary);
}

/* 총합 행 강조 */
.estimate-grand-total-row {
  display: flex;
  gap: var(--space-6);
  padding-top: var(--space-2);
  border-top: 1px solid var(--line-default);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  color: var(--ink-primary);
}

.estimate-grand-total-row .estimate-total-amount {
  font-size: var(--font-size-lg);
  color: var(--color-brand-600);
}
```

#### 1.3.4 상태별 액션 버튼 매핑

| 상태 | 허용 액션 | 버튼 variant |
|---|---|---|
| `QUOTE_DRAFT` | 편집, 발송 | `ghost` / `primary` |
| `QUOTE_SENT` | 편집, 수락, 거절 | `ghost` / `success` / `danger` |
| `QUOTE_ACCEPTED` | 슬립 변환 | `primary` |
| `QUOTE_REJECTED` | (읽기 전용) | — |
| `QUOTE_CONVERTED` | (읽기 전용) | — |
| 공통 | 인쇄 | `ghost` |

> 권한 가드: `usePermissions().canAccess('estimates.list', action)` — 작성은 CREATE, 편집/발송/수락/거절/변환은 UPDATE. 권한 없을 시 버튼 미노출.

#### 1.3.5 상세 data-testid 전체 목록

| data-testid | 요소 | 조건 |
|---|---|---|
| `estimate-detail-page` | 페이지 루트 `<div>` | 항상 |
| `estimate-detail-header` | 메타 헤더 `<div>` | 항상 |
| `estimate-detail-status-badge` | 상태 Badge | 항상 |
| `estimate-detail-lines-table` | 라인 DataTable 래퍼 | 항상 |
| `estimate-detail-totals` | 합계 박스 | 항상 |
| `estimate-edit-button` | [편집] `<button>` | DRAFT / SENT + 권한 보유 |
| `estimate-send-button` | [발송] `<button>` | DRAFT + 권한 보유 |
| `estimate-accept-button` | [수락] `<button>` | SENT + 권한 보유 |
| `estimate-reject-button` | [거절] `<button>` | SENT + 권한 보유 |
| `estimate-convert-button` | [슬립 변환] `<button>` | ACCEPTED + 권한 보유 |
| `estimate-print-button` | [인쇄] `<button>` | 항상 |

---

### 1.4 작성/편집 화면 레이아웃 ASCII Mockup

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [h1] 견적서 작성                                          [취소] [임시저장] [발송] │
│  ─────────────────────────────────────────────────────────────────────────────── │
│                                                                                  │
│  거래처 *      [자동완성 — 거래처명 입력...............................  ▼]       │
│  작성일 *      [2026-05-11]                                                       │
│  유효기간      [2026-06-10]    (기본: 작성일 +30일)                               │
│  비고          [_______________________________________________]                  │
│  ─────────────────────────────────────────────────────────────────────────────── │
│                                                                           [+ 행 추가] │
│  ┌────────────────────┬──────────┬──────┬────────────┬────────────┬────┐       │
│  │ 모델코드 (onBlur)   │  규격    │ 수량 │    단가    │  공급가액  │    │       │
│  ├────────────────────┼──────────┼──────┼────────────┼────────────┼────┤       │
│  │ [AHU-220V-4HP____] │ [4HP___] │ [2_] │ [1,200,000]│  2,400,000 │ 🗑 │       │
│  │ [FCU-110V-2HP____] │ [2HP___] │ [1_] │ [  500,000]│    500,000 │ 🗑 │       │
│  │ [________________] │ [______] │ [__] │ [__________]│          — │ 🗑 │       │
│  └────────────────────┴──────────┴──────┴────────────┴────────────┴────┘       │
│                                                                                  │
│                                   공급가액 합계:     2,900,000원                 │
│                                   부가세  합계:       290,000원                  │
│                                   총    합:         3,190,000원                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

#### 1.4.1 거래처 자동완성 input spec

```
입력 → 300ms debounce → GET /partners/search?keyword=
결과 드롭다운: businessName + businessNumber (2줄)
선택 시: partnerId (state 전용, 화면 미노출) + partnerName + snapshot 자동 채움
```

#### 1.4.2 모델코드 lookup (onBlur)

```
모델코드 셀 blur → GET /products/lookup?modelCode={value}
성공: productId (state 전용) + productName + 단가 자동 채움
실패: 셀 border: var(--state-danger) + lookupError 메시지 표시
```

#### 1.4.3 작성/편집 data-testid

| data-testid | 요소 |
|---|---|
| `estimate-form-page` | 폼 페이지 루트 |
| `estimate-form-partner-input` | 거래처 자동완성 `<input>` |
| `estimate-form-date-input` | 작성일 `<input type="date">` |
| `estimate-form-valid-until-input` | 유효기간 `<input type="date">` |
| `estimate-form-note-input` | 비고 `<input>` |
| (없음) | 마지막 행에 값을 입력하면 자동으로 빈 행이 생성됨 |
| `estimate-form-line-{uid}-model` | 모델코드 행 input |
| `estimate-form-line-{uid}-qty` | 수량 행 input |
| `estimate-form-line-{uid}-unit-price` | 단가 행 input |
| `estimate-form-line-{uid}-delete` | 행 삭제 `<button>` |
| `estimate-form-save-button` | [임시저장] `<button>` |
| `estimate-form-send-button` | [발송] `<button>` |
| `estimate-form-cancel-button` | [취소] `<button>` |

---

### 1.5 인쇄 양식 spec (EstimatePrintLayout)

> 매뉴얼: `docs/manual/01-영업/06-견적서.md`
> 기존 PrintLayout wrapper 재사용: `clients/desktop/src/renderer/print/PrintLayout.tsx`

**용지**: A4 portrait (210mm × 297mm), 여백 12mm

**ASCII Mockup**:

```
==========================================================================
                     (주)삼한공조시스템
                  사업자등록번호: 214-87-20659
                   서울특별시 XX구 XX로 XXX

                      견        적        서

  견적번호: EST-240001                       작성일: 2026년 05월 01일
  유효기간: 2026년 05월 31일
==========================================================================
  수신: (주)ABC냉동  귀중                 담당: 홍길동 (TEL: 010-XXXX-XXXX)
==========================================================================
 NO │ 품목명 (모델코드)  │   규격    │ 수량 │    단가    │  공급가액  │  세액
────┼───────────────────┼──────────┼──────┼────────────┼────────────┼──────────
  1 │ 에어핸들링유닛     │   4HP    │    2 │  1,200,000 │  2,400,000 │  240,000
  2 │ 팬코일유닛        │   2HP    │    1 │    500,000 │    500,000 │   50,000
────┴───────────────────┴──────────┴──────┴────────────┼────────────┼──────────
                                          공급가액 합계 │  2,900,000 │
                                          부   가   세  │    290,000 │
                                          ─────────────┼────────────┤
                                          합     계     │  3,190,000 │
==========================================================================
  유효기간 이후 본 견적서의 내용은 효력을 잃을 수 있습니다.
  본 견적서는 계약서가 아니며 정식 계약은 별도 진행됩니다.
                                                             1 / 1
```

**인쇄 CSS 지침**:

```css
@media print {
  .app-sidebar, .app-header, .no-print { display: none !important; }

  .estimate-print-header {
    text-align: center;
    margin-bottom: 12pt;
    font-size: var(--print-text-lg);
    font-weight: bold;
  }

  .estimate-print-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--print-text-sm);
  }

  .estimate-print-table th,
  .estimate-print-table td {
    border: 1px solid var(--color-neutral-300);
    padding: 4pt 6pt;
  }

  .estimate-print-table th {
    background: var(--color-neutral-100);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    font-weight: bold;
    text-align: center;
  }

  .estimate-print-totals-row {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background: var(--color-neutral-100);
    font-weight: bold;
  }

  .estimate-print-grand-total {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background: var(--color-neutral-900);
    color: var(--color-neutral-0);
    font-weight: bold;
  }
}

@page { size: A4 portrait; margin: 12mm; }
```

**Iteration 계획** (인쇄 양식 반복 정정 가드):

| 회차 | 내용 |
|---|---|
| 1차 (현재) | ASCII mockup + CSS spec 작성 |
| 2차 | FE mock 구현 후 Edge 캡처 → 사용자 검토 |
| 3차 | 헤더/표 간격/폰트 CSS 미세 조정 |
| 4차 | 실 데이터 연결 후 긴 품목명 / 다페이지 처리 |
| 5차 | 사용자 최종 승인 + QA 캡처 `docs/qa/p2-estimate-print/*.png` 첨부 |

---

## 2. 월말 마감 (AccountingPeriodClosingPage)

> 이카운트 참조: `docs/migration/ecount-reference/20260509_092006.png` (결산/마감 화면)
> 기존 구현: `clients/desktop/src/renderer/routes/MonthEndClosingPage.tsx` (현재 raw hex 다수 → 토큰 교체 필요)

### 2.1 화면 구성 개요

| 항목 | 내용 |
|---|---|
| 라우트 | `/accounting/period-closing` |
| 접근 권한 | 조회: `ACCOUNTANT` / `MASTER` / 마감 실행: `ACCOUNTANT` / `MASTER` / 역마감: `MASTER` |
| data-testid 루트 | `accounting-period-closing-page` |

### 2.2 전체 레이아웃 ASCII Mockup

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [h1] 회계 기간 마감 관리                                                         │
│  ─────────────────────────────────────────────────────────────────────────────── │
│                                                                                  │
│  ┌── 마감 실행 ───────────────────────────────────────────────────────────────┐  │
│  │                                                                            │  │
│  │  ⚠  마감 실행 시 해당 기간의 CONFIRMED 슬립이 LOCKED 전환되며              │  │
│  │     이후 분개/슬립 입력이 차단됩니다. 변경 필요 시 MASTER가 역마감 요청.  │  │
│  │                                                                            │  │
│  │  구분  [ 일별 | 월별 ]  기간  [2026-05  ▼]  메모 [________________]       │  │
│  │                                                                            │  │
│  │                               [시산표 열기 ↗]    [마감 실행]              │  │
│  └────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌── AccountingPeriod 상태 표 ─────────────────────────────────────────────────┐  │
│  │                                                                              │  │
│  │  구분 │ 기간 일자  │ 상태      │  매출합계  │  매입합계  │ 잠금슬립 │ 마감시각  │  │
│  │  ─────┼───────────┼──────────┼────────────┼────────────┼──────────┼─────────  │  │
│  │  월별  │ 2026-05   │ ● OPEN   │ 12,500,000 │  8,200,000 │        0 │   —       │  │
│  │  월별  │ 2026-04   │ ● CLOSED │ 18,340,000 │ 11,050,000 │       42 │ 04-30 23:59│  │
│  │  월별  │ 2026-03   │ ● CLOSED │ 16,900,000 │  9,870,000 │       38 │ 03-31 23:59│  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 AccountingPeriod 상태 표 스펙

#### 2.3.1 컬럼 구성

| 컬럼 | 데이터 필드 | 너비 | 정렬 | 비고 |
|---|---|---|---|---|
| 구분 | `periodType` | `70px` | center | DAILY="일별" / MONTHLY="월별" |
| 기간 일자 | `periodDate` | `130px` | left | MONTHLY는 YYYY-MM, DAILY는 YYYY-MM-DD |
| 상태 | `status` | `100px` | center | Status Badge (§2.3.2) |
| 매출 합계 | `totalSales` | `140px` | right | KRW 포맷 / `tabular-nums` |
| 매입 합계 | `totalPurchase` | `140px` | right | KRW 포맷 / `tabular-nums` |
| 판관비 | `totalExpense` | `120px` | right | KRW 포맷 / `tabular-nums` |
| 잠금 슬립 | `lockedSlipCount` | `90px` | right | 정수 / `tabular-nums` |
| 마감 시각 | `closedAt` | `140px` | left | ISO → "YYYY-MM-DD HH:mm" |
| 실행자 | `closedBy` | `100px` | left | 로그인 사용자명 |
| 역마감 | (action) | `90px` | center | CLOSED + MASTER 권한 시만 버튼 노출 |
| 이력 | (action) | `60px` | center | audit overlay 진입 버튼 |

#### 2.3.2 AccountingPeriod Status Badge 매핑

| BE 상태 | CSS 토큰 | 표시 라벨 | 점 색상 |
|---|---|---|---|
| `OPEN` | `var(--state-success)` / `var(--state-success-bg)` | OPEN | 녹색 |
| `CLOSED` | `var(--state-danger)` / `var(--state-danger-bg)` | CLOSED | 빨강 |

```tsx
// Status Badge — raw hex 금지, design-system 토큰 사용
function PeriodStatusBadge({ status }: { status: 'OPEN' | 'CLOSED' }) {
  const isOpen = status === 'OPEN'
  return (
    <span
      data-testid={`period-status-badge-${status.toLowerCase()}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: '3px var(--space-2)',
        borderRadius: 'var(--radius-chip)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-semibold)',
        background: isOpen ? 'var(--state-success-bg)' : 'var(--state-danger-bg)',
        color: isOpen ? 'var(--state-success)' : 'var(--state-danger)',
        border: `1px solid ${isOpen ? 'var(--state-success)' : 'var(--state-danger)'}`,
        whiteSpace: 'nowrap',
      }}
      role="status"
      aria-label={`기간 상태: ${isOpen ? '마감 전' : '마감 완료'}`}
    >
      <span aria-hidden="true" style={{ fontSize: 8 }}>●</span>
      {status}
    </span>
  )
}
```

#### 2.3.3 테이블 행 스타일 규칙

| 조건 | 행 배경 | 행 좌측 border |
|---|---|---|
| `OPEN` | `var(--surface-card)` | 없음 |
| `CLOSED` | `var(--color-neutral-50)` | `3px solid var(--state-danger)` |

```css
/* CLOSED 행 강조 */
.period-row--closed {
  background: var(--color-neutral-50);
  border-left: 3px solid var(--state-danger);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
```

### 2.4 마감 Confirm Dialog

마감 실행 버튼 클릭 시 브라우저 `window.confirm()` 대신 설계적 Confirm Dialog 사용.

```
┌────────────────────────────────────────────────────────────┐
│  회계 기간 마감 확인                                        │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  2026년 05월 (MONTHLY) 기간을 마감 처리합니다.              │
│                                                             │
│  마감 후:                                                   │
│  - 해당 기간의 모든 CONFIRMED 슬립이 LOCKED 전환            │
│  - 분개/슬립 입력 차단                                      │
│  - 역마감은 MASTER 권한자만 가능                            │
│                                                             │
│  메모: "5월 결산 마감"                                      │
│                                                             │
│                            [취소]   [마감 실행 확인]        │
└────────────────────────────────────────────────────────────┘
```

| 요소 | 스펙 |
|---|---|
| Dialog wrapper | `role="alertdialog"` + `aria-modal="true"` + `aria-describedby` |
| [취소] 버튼 | `variant="ghost"` |
| [마감 실행 확인] 버튼 | `variant="primary"` |
| Dialog 너비 | `min(480px, 90vw)` |

### 2.5 역마감 Confirm Dialog

```
┌────────────────────────────────────────────────────────────┐
│  역마감 확인                                                 │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  2026년 04월 (MONTHLY) 마감을 역마감 처리합니다.            │
│  역마감 후 슬립/분개 변경이 다시 허용됩니다.                │
│                                                             │
│  이 작업은 MASTER 권한자만 가능합니다. 진행하시겠습니까?   │
│                                                             │
│                            [취소]   [역마감 확인]           │
└────────────────────────────────────────────────────────────┘
```

| 요소 | 스펙 |
|---|---|
| [역마감 확인] 버튼 | `variant="danger"` |

### 2.6 Raw hex 교체 목록 (MonthEndClosingPage.tsx 기존 코드)

기존 `MonthEndClosingPage.tsx` 의 raw hex 를 design-system 토큰으로 교체해야 함 (PR #134~#147 회고 가드):

| 기존 raw hex | 교체 토큰 | 용도 |
|---|---|---|
| `'#D1D5DB'` | `var(--line-default)` | input border |
| `'#FEF3C7'` | `var(--state-warning-bg)` | 안내 배경 |
| `'#92400E'` | `var(--state-warning)` | 안내 텍스트 |
| `'#DC2626'` | `var(--state-danger)` | CLOSED 텍스트 |
| `'#059669'` | `var(--state-success)` | OPEN / 성공 텍스트 |
| `'#2563EB'` | `var(--color-brand-600)` | 링크 색상 |
| `'#374151'` | `var(--ink-primary)` | 레이블 색상 |
| `'#E5E7EB'` | `var(--line-default)` | 구분선 |
| `600 fontWeight` (인라인) | `var(--font-weight-semibold)` | |

### 2.7 data-testid 전체 목록

| data-testid | 요소 | 조건 |
|---|---|---|
| `accounting-period-closing-page` | 페이지 루트 `<div>` | 항상 |
| `closing-execution-card` | 마감 실행 카드 | 항상 |
| `closing-period-type-toggle` | 일별/월별 toggle 그룹 | 항상 |
| `closing-period-date-input` | 기간 일자 input | 항상 |
| `closing-description-input` | 메모 input | 항상 |
| `closing-new-button` | [마감 실행] `<button>` | 항상 |
| `closing-confirm-dialog` | 마감 확인 Dialog 래퍼 | 확인 Dialog 열림 시 |
| `closing-list-table` | 마감 이력 DataTable 래퍼 | 항상 |
| `closing-reverse-button` | [역마감] `<button>` | CLOSED + MASTER |
| `closing-reverse-confirm-dialog` | 역마감 확인 Dialog 래퍼 | 역마감 Dialog 열림 시 |
| `closing-audit-button-{id}` | 이력 [보기] `<button>` | 행별 |
| `closing-audit-panel` | audit overlay panel Card | 행 선택 시 |
| `closing-daily-detail-table` | 일별 detail DataTable 래퍼 | DAILY 탭 + 권한 |
| `closing-daily-detail-row-{seq}` | 일별 detail 행 (seq 셀) | 행별 |
| `closing-daily-detail-csv-button` | CSV 다운로드 `<button>` | DAILY 탭 + 권한 |

---

## 3. 매출 마감 (SalesClosingPage)

> 이카운트 참조: `docs/migration/ecount-reference/20260509_092016.png` (매출 월보)
> 연관 컴포넌트: `MonthEndClosingPage.tsx` 내 매출 집계 섹션 + 독립 화면 분리 고려

### 3.1 화면 구성 개요

| 항목 | 내용 |
|---|---|
| 라우트 | `/accounting/sales-closing` |
| 접근 권한 | `ACCOUNTANT` / `MANAGER` / `MASTER` |
| data-testid 루트 | `sales-closing-page` |

### 3.2 전체 레이아웃 ASCII Mockup

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [h1] 매출 마감                                                                   │
│  ─────────────────────────────────────────────────────────────────────────────── │
│                                                                                  │
│  조회 기간  [2026-01 ~ 2026-05]   [조회]                                         │
│  ─────────────────────────────────────────────────────────────────────────────── │
│                                                                                  │
│  ┌── 월별 매출 집계 ────────────────────────────────────────────────────────────┐ │
│  │                                                                              │ │
│  │  연월     │ 매출 합계   │  매입 합계  │  순이익      │ 슬립 건수 │ 마감 상태 │ │
│  │  ─────────┼────────────┼────────────┼─────────────┼───────────┼──────────  │ │
│  │  2026-05  │ 12,500,000 │  8,200,000 │   4,300,000 │        24 │ ● OPEN    │ │
│  │  2026-04  │ 18,340,000 │ 11,050,000 │   7,290,000 │        42 │ ● CLOSED  │ │
│  │  2026-03  │ 16,900,000 │  9,870,000 │   7,030,000 │        38 │ ● CLOSED  │ │
│  │  2026-02  │ 15,100,000 │  8,750,000 │   6,350,000 │        35 │ ● CLOSED  │ │
│  │  2026-01  │ 14,200,000 │  7,890,000 │   6,310,000 │        30 │ ● CLOSED  │ │
│  │  ─────────┼────────────┼────────────┼─────────────┼───────────┼──────────  │ │
│  │  합계     │ 77,040,000 │ 45,760,000 │  31,280,000 │       169 │           │ │
│  └──────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                  │
│  ┌── 선택 월 상세 (2026-05 클릭 시 확장) ──────────────────────────────────────┐ │
│  │                                                                              │ │
│  │  일자       │ 매출       │  매입      │  순이익     │ 세금계산서  │           │ │
│  │  ──────────┼────────────┼────────────┼─────────────┼────────────┤           │ │
│  │  2026-05-01 │  1,200,000 │    800,000 │    400,000  │          2 │           │ │
│  │  2026-05-02 │    900,000 │    650,000 │    250,000  │          1 │           │ │
│  │  ...        │                                                               │ │
│  └──────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 월별 매출 집계 테이블 컬럼 구성

| 컬럼 | 데이터 필드 | 너비 | 정렬 | 비고 |
|---|---|---|---|---|
| 연월 | `period` (YYYY-MM) | `100px` | left | |
| 매출 합계 | `totalSales` | `150px` | right | KRW / `tabular-nums` |
| 매입 합계 | `totalPurchase` | `150px` | right | KRW / `tabular-nums` |
| 순이익 | `netProfit` (totalSales - totalPurchase) | `150px` | right | 음수 시 `var(--color-danger)` + `(括弧)` 표기 |
| 슬립 건수 | `slipCount` | `90px` | right | `tabular-nums` |
| 마감 상태 | `closingStatus` | `100px` | center | Chip (§3.3.1) |
| 액션 | — | `120px` | center | OPEN + 권한 → [마감 실행] chip 버튼 |

#### 3.3.1 마감 상태 Chip 스펙

| 상태 | Chip 표시 | CSS 토큰 |
|---|---|---|
| `OPEN` | ● OPEN | `background: var(--state-success-bg)` / `color: var(--state-success)` / `border: 1px solid var(--state-success)` |
| `CLOSED` | ● CLOSED | `background: var(--state-danger-bg)` / `color: var(--state-danger)` / `border: 1px solid var(--state-danger)` |
| `NOT_CLOSED` (마감 기록 없음) | — | `color: var(--ink-tertiary)` |

```tsx
// 마감 상태 Chip — data-testid 필수
function ClosingStatusChip({
  status,
  period,
}: {
  status: 'OPEN' | 'CLOSED' | 'NOT_CLOSED'
  period: string
}) {
  if (status === 'NOT_CLOSED') {
    return <span style={{ color: 'var(--ink-tertiary)', fontSize: 'var(--font-size-xs)' }}>—</span>
  }
  const isOpen = status === 'OPEN'
  return (
    <span
      data-testid={`sales-closing-status-chip-${period}`}
      role="status"
      aria-label={`${period} 마감 상태: ${isOpen ? '마감 전' : '마감 완료'}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: '3px var(--space-2)',
        borderRadius: 'var(--radius-chip)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-semibold)',
        background: isOpen ? 'var(--state-success-bg)' : 'var(--state-danger-bg)',
        color: isOpen ? 'var(--state-success)' : 'var(--state-danger)',
        border: `1px solid ${isOpen ? 'var(--state-success)' : 'var(--state-danger)'}`,
        whiteSpace: 'nowrap',
        cursor: 'default',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 8 }}>●</span>
      {status}
    </span>
  )
}
```

### 3.4 합계 행 스타일

```css
/* 합계 행 — 하단 고정 / 강조 */
.sales-closing-total-row {
  background: var(--color-neutral-100);
  border-top: 2px solid var(--color-neutral-300);
  font-weight: var(--font-weight-semibold);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.sales-closing-total-row td {
  color: var(--color-neutral-900);
  font-variant-numeric: tabular-nums;
}
```

### 3.5 선택 월 일별 상세 패널

월별 집계 행 클릭 시 하단에 인라인 확장 패널 표시 (Accordion 패턴).

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  ▼ 2026-05 일별 상세                                              [CSV 다운로드] │
│  ─────────────────────────────────────────────────────────────────────────────  │
│  일자        │ 매출       │  매입      │  세금계산서 건수 │ 발행 세금계산서번호  │
│  ──────────┼────────────┼────────────┼─────────────────┼──────────────────────  │
│  2026-05-01 │  1,200,000 │    800,000 │               2 │ TI-2026-0501-001     │
│  2026-05-02 │    900,000 │    650,000 │               1 │ TI-2026-0502-001     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

```css
.sales-closing-detail-panel {
  border: 1px solid var(--line-default);
  border-radius: var(--radius-card);
  margin-top: var(--space-4);
  background: var(--surface-card);
  overflow: hidden;
}

.sales-closing-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  background: var(--color-neutral-50);
  border-bottom: 1px solid var(--line-default);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--ink-primary);
  cursor: pointer;
}
```

### 3.6 data-testid 전체 목록

| data-testid | 요소 | 조건 |
|---|---|---|
| `sales-closing-page` | 페이지 루트 `<div>` | 항상 |
| `sales-closing-period-start` | 기간 시작 `<input type="month">` | 항상 |
| `sales-closing-period-end` | 기간 종료 `<input type="month">` | 항상 |
| `sales-closing-search-button` | [조회] `<button>` | 항상 |
| `sales-closing-summary-table` | 월별 집계 DataTable 래퍼 | 항상 |
| `sales-closing-status-chip-{period}` | 마감 상태 Chip (period=YYYY-MM) | 행별 |
| `sales-closing-action-button-{period}` | [마감 실행] 버튼 (OPEN 행) | OPEN + 권한 |
| `sales-closing-total-row` | 합계 행 | 항상 |
| `sales-closing-detail-panel` | 일별 상세 패널 | 월 선택 시 |
| `sales-closing-detail-table` | 일별 상세 DataTable | 패널 열림 시 |
| `sales-closing-detail-csv-button` | CSV 다운로드 `<button>` | 패널 열림 시 |

---

## 4. 재고 실사 (InventoryAuditDetailPage — 디자인 보강)

> 이카운트 참조: `docs/migration/ecount-reference/20260509_091847.png` (재고조사서)
> 기존 구현: `clients/desktop/src/renderer/routes/InventoryAuditDetailPage.tsx`

### 4.1 화면 구성 개요

| 항목 | 내용 |
|---|---|
| 라우트 (목록) | `/warehouse/audit` |
| 라우트 (상세) | `/warehouse/audit/:id` |
| 접근 권한 | 조회: `MASTER` / `MANAGER` / `WAREHOUSE` / 라인 입력: `MASTER` / `MANAGER` / `WAREHOUSE` |
| data-testid 루트 | `audit-detail-page` |

### 4.2 상세 화면 전체 레이아웃 ASCII Mockup

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  [h1] 재고 실사 상세                          [시작]  [완료]  [취소] ← status별   │
│  ─────────────────────────────────────────────────────────────────────────────── │
│                                                                                  │
│  ┌── 실사 헤더 ──────────────────────────────────────────────────────────────┐   │
│  │  실사번호:  AUDIT-2026-0001        상태: ● IN_PROGRESS                    │   │
│  │  창고:      서울 본창고 (SEOULSRC)  실사일자: 2026-05-11                   │   │
│  │  차이금액:  ▼ ₩120,000             (차이 > 0 시 warning 강조)              │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌── 바코드 / 수동 입력 ────────────────────────────────────────────────────┐   │
│  │  모델코드 [AHU-220V-4HP_____________] 실수량 [_5_]  [등록]               │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌── 라인 테이블 ──────────────────────────────────────────────────────────┐   │
│  │  품목명 (모델코드) │ 장부수량 │ 실수량     │  차이      │  단가    │ 차이금액 │   │
│  │  ─────────────────┼─────────┼────────────┼────────────┼──────────┼─────── │   │
│  │  에어핸들링유닛    │     100  │  [  98  ]  │    ▼ -2    │ 1,200,000│▼-2,400,000│ │
│  │   AHU-220V-4HP    │          │            │ ← 차이 강조│          │ ← 강조  │   │
│  │  ─────────────────┼─────────┼────────────┼────────────┼──────────┼─────── │   │
│  │  팬코일유닛        │      50  │  [  52  ]  │    ▲ +2    │   500,000│▲+1,000,000│ │
│  │   FCU-110V-2HP    │          │            │ ← 초과 강조│          │ ← 강조  │   │
│  │  ─────────────────┼─────────┼────────────┼────────────┼──────────┼─────── │   │
│  │  냉수코일유닛      │      30  │  [  30  ]  │     —      │   800,000│       — │ │
│  │   CHW-220V-3HP    │          │            │            │          │          │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 라인 테이블 컬럼 구성

| 컬럼 | 데이터 필드 | 너비 | 정렬 | 비고 |
|---|---|---|---|---|
| 품목명 (모델코드) | `productName` + `modelCode` 2줄 | flex 1 | left | UUID 미노출 — productName 1행 / modelCode 2행 (소자) |
| 장부수량 | `expectedQty` | `90px` | right | 읽기 전용 / `tabular-nums` / `var(--ink-tertiary)` |
| 실수량 | `actualQty` | `120px` | center | `<input type="number" min=0>` 편집 가능 (IN_PROGRESS 시) |
| 차이 | `diff` (actualQty - expectedQty) | `100px` | right | 차이 강조 badge (§4.3.1) |
| 단가 | `unitPrice` | `110px` | right | KRW / `tabular-nums` |
| 차이금액 | `diffAmount` | `130px` | right | KRW / 양수 ▲ / 음수 ▼ (§4.3.2) |

#### 4.3.1 차이 강조 Badge (DiffBadge)

| 조건 | 표시 | CSS 토큰 |
|---|---|---|
| `diff === 0` | `—` | `var(--ink-tertiary)` |
| `diff > 0` (초과) | `▲ +{diff}` | `background: var(--state-warning-bg)` / `color: var(--state-warning)` |
| `diff < 0` (부족) | `▼ {diff}` | `background: var(--state-danger-bg)` / `color: var(--state-danger)` |

```tsx
// DiffBadge — raw hex 금지
function DiffBadge({ diff }: { diff: number }) {
  if (diff === 0) {
    return <span style={{ color: 'var(--ink-tertiary)', fontVariantNumeric: 'tabular-nums' }}>—</span>
  }
  const isOver = diff > 0
  return (
    <span
      aria-label={`장부 대비 ${isOver ? '초과' : '부족'} ${Math.abs(diff)}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: '2px var(--space-2)',
        borderRadius: 'var(--radius-chip)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-medium)',
        background: isOver ? 'var(--state-warning-bg)' : 'var(--state-danger-bg)',
        color: isOver ? 'var(--state-warning)' : 'var(--state-danger)',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {isOver ? '▲' : '▼'} {isOver ? '+' : ''}{diff}
    </span>
  )
}
```

#### 4.3.2 차이금액 표시 규칙

| 조건 | 표시 | 색상 |
|---|---|---|
| `diffAmount === 0` | `—` | `var(--ink-tertiary)` |
| `diffAmount > 0` | `▲ ₩{N}` | `var(--state-warning)` |
| `diffAmount < 0` | `▼ ₩{N}` | `var(--state-danger)` |

### 4.4 라인 행 상태 강조 규칙

| 상태 | 조건 | 행 배경 | 행 좌측 border |
|---|---|---|---|
| 정상 | `diff === 0` | `var(--surface-card)` | 없음 |
| 초과 (over) | `diff > 0` | `var(--state-warning-bg)` | `3px solid var(--state-warning)` |
| 부족 (shortage) | `diff < 0` | `var(--state-danger-bg)` | `3px solid var(--state-danger)` |

```css
/* 재고 실사 라인 행 상태 클래스 */
.audit-line-row {
  background: var(--surface-card);
  transition: background var(--duration-fast);
}

.audit-line-row.over {
  background: var(--state-warning-bg);
  border-left: 3px solid var(--state-warning);
}

.audit-line-row.shortage {
  background: var(--state-danger-bg);
  border-left: 3px solid var(--state-danger);
}
```

### 4.5 실수량 Input spec

```tsx
<input
  type="number"
  min={0}
  step={1}
  value={line.actualQty}
  onChange={(e) => onActualQtyChange(line.lineId, Number(e.target.value))}
  data-testid={`audit-line-actual-qty-input-${line.lineId}`}
  aria-label={`${line.modelCode} 실수량`}
  disabled={auditStatus !== 'IN_PROGRESS'}
  style={{
    width: '100%',
    height: '32px',
    padding: '0 var(--space-3)',
    border: '1px solid var(--line-default)',
    borderRadius: 'var(--radius-input)',
    fontSize: 'var(--font-size-sm)',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    background: auditStatus === 'IN_PROGRESS' ? 'var(--surface-card)' : 'var(--surface-subtle)',
    color: 'var(--ink-primary)',
    cursor: auditStatus === 'IN_PROGRESS' ? 'text' : 'not-allowed',
  }}
/>
```

### 4.6 실사 헤더 상태 Badge 매핑

| BE 상태 | Badge variant | 표시 라벨 |
|---|---|---|
| `PLANNED` | `neutral` | 계획됨 |
| `IN_PROGRESS` | `brand` | 진행중 |
| `COMPLETED` | `success` | 완료 |
| `CANCELLED` | `danger` | 취소 |

### 4.7 헤더 차이금액 강조

```
┌─────────────────────────────────────────────────────────┐
│  차이금액:  ▼ ₩120,000   ← warning / danger 강조         │
│             ▲ ₩300,000   ← 초과 시 warning              │
│             ₩0           ← 정상 (neutral)                │
└─────────────────────────────────────────────────────────┘
```

```tsx
// 헤더 차이금액 강조 컴포넌트
function AuditDiffAmount({ totalDiff }: { totalDiff: number }) {
  if (totalDiff === 0) {
    return (
      <span
        data-testid="audit-detail-diff-amount"
        style={{ color: 'var(--state-success)', fontWeight: 'var(--font-weight-semibold)' }}
      >
        차이 없음
      </span>
    )
  }
  const isOver = totalDiff > 0
  const formatted = '₩' + Math.abs(totalDiff).toLocaleString('ko-KR')
  return (
    <span
      data-testid="audit-detail-diff-amount"
      style={{
        color: isOver ? 'var(--state-warning)' : 'var(--state-danger)',
        fontWeight: 'var(--font-weight-semibold)',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {isOver ? '▲' : '▼'} {formatted}
    </span>
  )
}
```

### 4.8 바코드/수동 입력 폼 CSS spec

```css
.audit-barcode-form {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--line-default);
  border-radius: var(--radius-card);
  background: var(--surface-card);
  margin-bottom: var(--space-4);
  flex-wrap: wrap;
}

.audit-barcode-form-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--ink-secondary);
  white-space: nowrap;
}

.audit-barcode-form input[type="text"],
.audit-barcode-form input[type="number"] {
  height: 36px;
  padding: 0 var(--space-3);
  border: 1px solid var(--line-default);
  border-radius: var(--radius-input);
  font-size: var(--font-size-sm);
  font-family: var(--font-family-sans);
  color: var(--ink-primary);
  background: var(--surface-card);
}

.audit-barcode-form input:focus {
  outline: none;
  border-color: var(--line-focus);
  box-shadow: 0 0 0 2px var(--action-brand-subtle);
}
```

### 4.9 data-testid 전체 목록

| data-testid | 요소 | 조건 |
|---|---|---|
| `audit-detail-page` | 페이지 루트 `<div>` | 항상 |
| `audit-detail-header` | 실사 헤더 영역 | 항상 |
| `audit-detail-status-badge` | 상태 Badge | 항상 |
| `audit-detail-diff-amount` | 차이금액 강조 | 항상 |
| `audit-barcode-form` | 바코드/수동 입력 폼 | 항상 |
| `audit-line-barcode-input` | 모델코드 input | 항상 |
| `audit-line-actual-input` | 실수량 quick input | 항상 |
| `audit-line-record-button` | [등록] `<button>` | 항상 |
| `audit-detail-lines-table` | 라인 DataTable 래퍼 | 항상 |
| `audit-line-actual-qty-input-{lineId}` | 라인별 실수량 `<input>` | 행별 (IN_PROGRESS) |
| `audit-line-diff-badge-{lineId}` | 라인별 차이 DiffBadge | 행별 |
| `audit-start-button` | [시작] `<button>` | PLANNED + 권한 |
| `audit-complete-button` | [완료] `<button>` | IN_PROGRESS + 권한 |
| `audit-cancel-button` | [취소] `<button>` | PLANNED / IN_PROGRESS + 권한 |

---

## 5. 컬러 토큰 사용 위반 방지 체크리스트 (PR #134~#147 회고 가드)

> 모든 FE 구현에서 PR 제출 전 아래 체크리스트 확인 필수.

| 항목 | 위반 예시 | 올바른 토큰 |
|---|---|---|
| 경계선 색상 | `'#D1D5DB'` | `var(--line-default)` |
| 경고 배경 | `'#FEF3C7'` | `var(--state-warning-bg)` |
| 경고 텍스트 | `'#92400E'` | `var(--state-warning)` |
| 위험 텍스트 | `'#DC2626'` | `var(--state-danger)` |
| 성공 텍스트 | `'#059669'` | `var(--state-success)` |
| 브랜드 링크 | `'#2563EB'` | `var(--color-brand-600)` |
| 기본 텍스트 | `'#374151'` | `var(--ink-primary)` |
| 보조 텍스트 | `'#6B7280'` | `var(--ink-secondary)` |
| 구분선 | `'#E5E7EB'` | `var(--line-default)` |
| 배경 미묘 | `'#F3F4F6'` | `var(--surface-subtle)` |
| hover 배경 | `'#F9FAFB'` | `var(--surface-hover)` |
| 폰트 굵기 인라인 | `fontWeight: 600` | `var(--font-weight-semibold)` |
| 폰트 크기 인라인 | `fontSize: 13` | `var(--font-size-sm)` |

---

## 6. 공통 에러 배너 스펙

모든 4개 화면에서 동일한 에러 배너 패턴 사용.

```css
.error-banner {
  background: var(--state-danger-bg);
  border: 1px solid var(--state-danger);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-sm);
  color: var(--state-danger);
  margin-bottom: var(--space-3);
}
```

```tsx
// 에러 배너 — role="alert" 필수
{errorMessage && (
  <div className="error-banner" role="alert">
    {errorMessage}
  </div>
)}
```

---

## 7. 접근성 (A11y) 공통 체크리스트

| 항목 | 요구사항 |
|---|---|
| 페이지 제목 | `<h1>` 태그 + `usePageTitle()` 훅 |
| 테이블 | `aria-label` 또는 `<caption>` |
| Status Badge | `role="status"` + 한국어 `aria-label` |
| 에러 배너 | `role="alert"` + `aria-live="assertive"` |
| Confirm Dialog | `role="alertdialog"` + `aria-modal="true"` + `aria-describedby` |
| 편집 input | `aria-label="{context} {필드명}"` |
| 비활성 input | `disabled` + `aria-disabled="true"` |
| 읽기 전용 | `readOnly` + `tabIndex={-1}` (선택) |
| 키보드 | 테이블 행 Enter/Space 클릭 (`tabIndex={0}` + `onKeyDown`) |
| 포커스 트랩 | Dialog 내부 한정 (`focus-trap-react` 또는 커스텀 useEffect) |

---

## 8. TypeScript 타입 정의 요약 (Frontend agent 전달)

### 8.1 견적서

```typescript
export type EstimateStatus =
  | 'QUOTE_DRAFT'
  | 'QUOTE_SENT'
  | 'QUOTE_ACCEPTED'
  | 'QUOTE_REJECTED'
  | 'QUOTE_CONVERTED'

export interface EstimateLine {
  uid: string           // 화면 내부 key (화면 미노출)
  productId: string | null  // 화면 미노출
  modelName: string
  productName: string
  specification: string
  quantity: number
  unitPrice: string     // KRW BigDecimal string
  supplyAmount: string
  vatAmount: string
  lineTotal: string
}

export interface EstimateDetail {
  id: string            // 화면 미노출 (라우트 path key 전용)
  estimateNo: string    // 화면 표시 식별자
  partnerName: string
  partnerBusinessNo: string | null
  estimateDate: string  // YYYY-MM-DD
  validUntil: string | null
  status: EstimateStatus
  lines: EstimateLine[]
  totalSupply: string
  totalVat: string
  totalAmount: string
  convertedSlipId: string | null  // 화면 미노출 (슬립 이동 link 전용)
  note: string | null
}
```

### 8.2 회계 기간

```typescript
export type PeriodType = 'DAILY' | 'MONTHLY'
export type PeriodStatus = 'OPEN' | 'CLOSED'

export interface AccountingPeriod {
  id: string           // 화면 미노출 (역마감 API path 전용)
  periodType: PeriodType
  periodDate: string   // YYYY-MM-DD
  status: PeriodStatus
  totalSales: string | null
  totalPurchase: string | null
  totalExpense: string | null
  lockedSlipCount: number
  closedAt: string | null
  closedBy: string | null
  description: string | null
}
```

### 8.3 재고 실사

```typescript
export type AuditStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'

export interface AuditLine {
  lineId: string       // data-testid 전용 (화면 미노출)
  modelCode: string    // 화면 표시 식별자
  productName: string  // 화면 표시
  expectedQty: number  // 장부수량
  actualQty: number    // 실수량 (편집)
  unitPrice: string    // KRW
  diff: number         // actualQty - expectedQty (클라이언트 계산)
  diffAmount: string   // diff * unitPrice (클라이언트 계산)
}

export interface AuditDetail {
  id: string           // 화면 미노출 (라우트 path key 전용)
  auditNo: string      // 화면 표시 식별자
  warehouseName: string
  warehouseCode: string  // 화면 미노출
  auditDate: string    // YYYY-MM-DD
  status: AuditStatus
  totalDiffAmount: string | null
  lines: AuditLine[]
}
```

---

## 9. Iteration 계획 (4개 화면 통합)

메모리 가드 `feedback_print_design_iteration.md` 준수.

| 회차 | 대상 | 내용 | 검토 방법 | 완료 기준 |
|---|---|---|---|---|
| 1차 (현재) | 전체 | 본 spec 작성 | Designer 산출물 검토 | 4화면 레이아웃 + 필드 + 상태 정책 확정 |
| 2차 | 전체 | FE 1차 mock 구현 후 Edge 캡처 | PR comment 이미지 첨부 | 화면 렌더 + 상태 Badge + 강조 시각 확인 |
| 3차 | 견적서 인쇄, 마감 Confirm | 인쇄 CSS 미세 조정 + Dialog UX 검토 | Edge 캡처 + 사용자 검토 | 인쇄 preview 정렬 / Dialog 포커스 동작 |
| 4차 | 전체 | BE API 연결 후 실 데이터 기반 검증 | QA 에이전트 시나리오 | E2E 통과 + raw hex 0건 검증 |
| 5차 | 전체 | 이카운트 참조 캡처 vs 결과물 비교 + 최종 승인 | QA 에이전트 + 개발책임자 | 최종 QA 캡처 `docs/qa/p2-integrated/*.png` 첨부 |

---

## 10. 관련 파일 경로

| 파일 | 역할 |
|---|---|
| `clients/desktop/src/renderer/routes/EstimateListPage.tsx` | 견적서 목록 (기존 raw hex 교체 대상) |
| `clients/desktop/src/renderer/routes/EstimateDetailPage.tsx` | 견적서 상세 (기존 raw hex 교체 대상) |
| `clients/desktop/src/renderer/routes/EstimateFormPage.tsx` | 견적서 작성/편집 (기존 raw hex 교체 대상) |
| `clients/desktop/src/renderer/routes/MonthEndClosingPage.tsx` | 회계 기간 마감 (raw hex 다수 → 전면 교체 대상) |
| `clients/desktop/src/renderer/routes/InventoryAuditDetailPage.tsx` | 재고 실사 상세 (강조 시각화 보강 대상) |
| `clients/desktop/src/renderer/routes/InventoryAuditListPage.tsx` | 재고 실사 목록 |
| `clients/desktop/src/renderer/print/PrintLayout.tsx` | 공통 인쇄 wrapper 재사용 |
| `clients/web/design-system/src/tokens/tokens.css` | 모든 CSS 변수 토큰 정의 |
| `docs/migration/ecount-reference/` | 이카운트 ERP 참조 캡처 16종 |
| `docs/qa/p2-integrated/` | QA 스크린샷 저장 경로 (2차 iteration 이후) |
