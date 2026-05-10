# P0-4 세금계산서 발행 + 인쇄 양식 디자인 가이드

> Designer 산출물 (P0-4 Slice A/B/C 통합). Frontend agent 가 본 spec 을 토대로
> `TaxInvoiceView.tsx` / `TaxInvoiceCreatePage` / `TaxInvoiceDetailPage` /
> `TaxInvoiceListPage` 를 구현한다.
> Slice A/B/C 가이드 패턴 계승 — raw hex 0건, design-system 토큰만 사용.

---

## 1. 범위 및 전제

| 항목 | 내용 |
| --- | --- |
| 양식 종류 | 한국 국세청 (NTS) 표준 세금계산서 — 종이 양식 (전자세금계산서 별도) |
| 기준 | 부가가치세법 제32조, 국세청 세금계산서 표준 서식 |
| 용지 | A4 portrait (210mm × 297mm) |
| 여백 | 상하좌우 12mm — `@page { margin: 12mm; }` |
| 인쇄 발행 | `window.print()` — 기존 `PrintLayout` wrapper 재사용 (`../../print/PrintLayout`) |
| 권한 | ACCOUNTANT / MASTER (`canAccessAccounting` 함수) |
| 회사 정보 | (주)삼한공조시스템 / 사업자등록번호 214-87-20659 / 대표 김미선 |
| 기존 구현체 | `clients/desktop/src/renderer/print/TaxInvoiceView.tsx` (1차 mock) |
| 기존 API 타입 | `clients/desktop/src/renderer/api/printApi.ts` — `TaxInvoiceDetail` / `TaxInvoiceLine` |

---

## 2. 컬러 토큰 (raw hex 직접 사용 금지)

### 2-1. 공통 인쇄 토큰 (Slice A/B/C 재사용)

| 용도 | CSS 토큰 |
| --- | --- |
| 표 헤더 텍스트 | `var(--color-neutral-900)` |
| 표 헤더 배경 | `var(--color-neutral-100)` |
| 본문 텍스트 | `var(--color-neutral-800)` |
| 구분선 / 테두리 | `var(--color-neutral-200)` |
| 음수 / 취소 금액 | `var(--color-danger)` |
| 최종 합계 행 배경 | `var(--color-neutral-900)` |
| 최종 합계 행 텍스트 | `var(--color-neutral-0)` |
| 성공 텍스트 | `var(--color-success)` |

### 2-2. 세금계산서 전용 토큰

| 용도 | CSS 토큰 | 비고 |
| --- | --- | --- |
| 세금계산서 타이틀 텍스트 | `var(--color-danger)` | NTS 표준 — 빨간색 제목 |
| 공급자 라벨 배경 | `var(--color-neutral-100)` | "공급자" 세로 셀 |
| 공급받는자 라벨 배경 | `var(--color-neutral-100)` | "공급받는자" 세로 셀 |
| 영수/청구 선택 강조 | `var(--color-brand-600)` | 선택 항목 체크 표시 |
| 인쇄 테두리 (외곽) | `var(--color-neutral-900)` | 2px solid |
| 인쇄 테두리 (내부) | `var(--color-neutral-300)` | 1px solid |

### 2-3. 화면 상태 Badge 토큰

| Status | Badge 배경 토큰 | Badge 텍스트 토큰 | 의미 |
| --- | --- | --- | --- |
| `DRAFT` | `var(--color-neutral-100)` | `var(--color-neutral-700)` | 임시저장 |
| `ISSUED` | `var(--state-success-bg)` | `var(--color-success)` | 발행 완료 |
| `CANCELLED` | `var(--state-danger-bg)` | `var(--state-danger)` | 취소됨 |

---

## 3. 타이포그래피 스케일

| 요소 | 화면 토큰 | 인쇄 토큰 | weight |
| --- | --- | --- | --- |
| 양식 타이틀 (세금계산서) | `--font-size-xl` (18px) | `var(--print-text-lg)` 18pt | bold 700 |
| 공급자/수신자 라벨 | `--font-size-sm` (13px) | `var(--print-text-sm)` 11pt | semibold 600 |
| 표 헤더 | `--font-size-sm` (13px) | `var(--print-text-sm)` 11pt | semibold 600 |
| 본문 텍스트 | `--font-size-sm` (13px) | `var(--print-text-sm)` 11pt | regular 400 |
| 금액 (tabular-nums) | `--font-size-sm` (13px) | `var(--print-text-sm)` 11pt | regular 400 |
| 합계 금액 | `--font-size-base` (14px) | `var(--print-text-md)` 12pt | bold 700 |
| 한글 금액 표기 | `--font-size-base` (14px) | `var(--print-text-md)` 12pt | bold 700 |
| 책번호/일련번호 | `--font-size-xs` (12px) | 9pt | regular 400 |
| 푸터 주석 | `--font-size-xs` (12px) | 9pt | regular 400 |

금액 컬럼: `text-align: right`, `font-variant-numeric: tabular-nums` 의무.
인쇄 폰트: `--font-family-print` (명조계열, Noto Serif KR fallback).

---

## 4. NTS 표준 세금계산서 인쇄 양식 spec

### 4-1. 양식 구성 순서 (상단 → 하단)

```
[1] 상단 헤더: 책번호 / 일련번호 (좌) + 타이틀 (중) + 작성일자 (우)
[2] 공급자 박스 (좌 절반) + 공급받는자 박스 (우 절반)
[3] 작성일자 행 + 공급가액 11자리 셀 + 세액 11자리 셀 + 비고
[4] 라인 표: 월/일/품목/규격/수량/단가/공급가액/세액/비고 (최소 4행 패딩)
[5] 합계 행: 합계금액 / 현금 / 수표 / 어음 / 외상미수금 + 영수/청구 체크
[6] 한글 금액 표기 행
```

### 4-2. 공급자 / 공급받는자 박스 컬럼 구성

```
| 공급자 세로라벨 | 필드명 | 값 | 공급받는자 세로라벨 | 필드명 | 값 |
```

공급자 필드 순서:
1. 등록번호 (사업자등록번호 XXX-XX-XXXXX)
2. 상호(법인명) + 성명(대표자) + (인) 인장
3. 사업장 주소 (colSpan 병합)
4. 업태 + 종목 (좌우 분리)
5. 종사업장번호 + 전화번호

공급받는자 필드 순서:
1. 등록번호
2. 상호(법인명) + 성명(대표자)
3. 사업장 주소
4. 업태
5. 종목

### 4-3. 공급가액/세액 11자리 셀 레이블

```
천억 / 백억 / 십억 / 억 / 천만 / 백만 / 십만 / 만 / 천 / 백 / 십 / 원
```

각 자리를 개별 `<td>` 로 분리, 빈 자리는 공백. `splitDigits11()` 헬퍼 (`TaxInvoiceView.tsx` 기존 구현) 재사용.

### 4-4. 라인 표 컬럼 정의

| 컬럼 | CSS class | 최소 width | 정렬 |
| --- | --- | --- | --- |
| 월 | `.col-month` | 20px | center |
| 일 | `.col-day` | 20px | center |
| 품목 | `.col-product` | auto (flex-grow) | left |
| 규격 | `.col-spec` | 60px | left |
| 수량 | `.col-qty` | 50px | right |
| 단가 | `.col-price` | 80px | right |
| 공급가액 | `.col-supply` | 90px | right |
| 세액 | `.col-vat` | 70px | right |
| 비고 | `.col-note` | 60px | left |

최소 4행 표시 (데이터 부족 시 빈 패딩 행 `.pad-row` 자동 삽입).

---

## 5. ASCII Mockup (NTS 표준)

```
+------------------------------------------------------------------+
|  책번호       권       호   세 금 계 산 서   작성일자: 2026. 05. 09 |
|  일련번호 20260509-00001    (공급받는자 보관용)                     |
+==========================+=======================================+
| 공 | 등록번호   214-87-20659 | 공 | 등록번호  123-45-67890       |
| 급 | 상호(법인명) (주)삼한공조시스템 | 급 | 상호     (주)ABC냉동         |
| 자 | 성명  김미선 (인)       | 받 | 성명     홍길동               |
|   | 사업장주소 서울특별시 서초구    | 는 | 사업장주소 부산광역시 해운대구    |
|   |           마방로2길 9    | 자 |                             |
|   | 업태  도매및소매업 종목 공조설비 |   | 업태  제조업  종목  냉동설비    |
|   | 종사업장번호 0000  전화 02-3461-0000 |  |                         |
+=========+==========+======+====+=====+=====+====+=====+=========+
| 작성      | 공  급  가  액 (천억~원 11자리)  | 세  액 (11자리)  | 비고  |
|           |  0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |...|   |
+====+=====+==========+=========+======+========+=======+======+====+
| 월 |  일  |    품   목    |  규격  | 수량 |   단가   | 공급가액 | 세액 | 비고 |
+----+-----+---------------+-------+------+----------+--------+------+----+
| 05 |  09  | 공조설비 설치   | A-100 |   2  | 1,500,000| 3,000,000|300,000|   |
| 05 |  09  | 냉매 충전     | R-410 |   5  |   50,000 |   250,000| 25,000|   |
|    |      |               |       |      |          |         |       |   |
|    |      |               |       |      |          |         |       |   |
+===========+==============+=======+======+==========+=========+=======+====+
| 합계금액        | 현 금 | 수 표 | 어 음 | 외상미수금 | 이 금액을              |
| 3,575,000      |       |      |      | 3,575,000  | □ 영수  ■ 청구  함   |
+================+=======+======+=======+============+=======================+
| 금액(한글): 일금 삼백오십칠만오천원 정                                     |
+------------------------------------------------------------------+
```

---

## 6. CSS @media print 지침

```css
@page {
  size: A4 portrait;
  margin: 12mm;
}

@media print {
  .app-sidebar,
  .app-header,
  .no-print {
    display: none !important;
  }

  .app-shell {
    grid-template-columns: 1fr;
  }

  /* 세금계산서 인쇄 영역 — 색상 강제 출력 */
  .tax-invoice-page {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* 타이틀 빨간색 강제 */
  .tax-invoice-title {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color: var(--color-danger) !important;
  }

  /* 공급자/수신자 라벨 배경 강제 */
  .party-side {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background-color: var(--color-neutral-100) !important;
  }

  /* 합계 행 배경 강제 */
  .tax-invoice-grand-total {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    background-color: var(--color-neutral-900) !important;
    color: var(--color-neutral-0) !important;
  }
}
```

---

## 7. Props spec (Frontend agent 전달)

### 7-1. 인쇄 Props (기존 BE 타입과 매핑)

기존 `TaxInvoiceDetail` (`printApi.ts`) 과 본 spec 의 대응:

```typescript
// 기존 TaxInvoiceDetail → 인쇄 양식 매핑
// (별도 변환 레이어 불필요 — view 가 직접 사용)

interface TaxInvoicePrintData {
  // 헤더
  bookNumber: string         // 책번호 (현재 고정 "권 호" — 추후 채번 체계 연동)
  serialNumber: string       // 일련번호 = taxInvoiceNo (ISSUED) / "미발행" (DRAFT)
  issueDate: string          // YYYY-MM-DD = supplyDate

  // 공급자 (COMPANY 상수에서 자동 주입 — PrintLayout.tsx COMPANY 재사용)
  supplier: {
    businessNumber: string   // COMPANY.businessRegNo
    companyName: string      // COMPANY.legalName
    representativeName: string // COMPANY.ceo
    address: string          // COMPANY.address
    businessType: string     // COMPANY.businessType
    businessItem: string     // COMPANY.businessItem
    subBusinessNo: string    // COMPANY.subBusinessNo
    tel: string              // COMPANY.tel
  }

  // 공급받는자 (BE API partnerXxx 필드)
  recipient: {
    businessNumber: string   // partnerBusinessNo (null → '-')
    companyName: string      // partnerName (null → '-')
    representativeName: string // 현재 BE 미제공 → '-' (iteration 2 추가 예정)
    address: string          // partnerAddress (null → '-')
    businessType: string     // 현재 BE 미제공 → '-' (iteration 2)
    businessItem: string     // 현재 BE 미제공 → '-' (iteration 2)
  }

  // 공급가액/세액 (BE supplyAmount / vatAmount — BigDecimal string)
  supplyAmountStr: string    // supplyAmount
  vatAmountStr: string       // vatAmount

  // 라인 (BE TaxInvoiceLine[])
  lines: TaxInvoicePrintLine[]

  // 합계
  totalSupplyAmount: string  // supplyAmount
  totalVatAmount: string     // vatAmount
  totalAmount: string        // totalAmount
  totalAmountKorean: string  // toKoreanAmount(totalAmount) — PrintLayout 헬퍼

  // 비고/구분
  memo: string               // description (null → '')
  receivedOrBilled: 'RECEIVED' | 'BILLED'  // 영수 / 청구 — DRAFT 기본값 BILLED

  generatedAt: string        // issuedAt (ISSUED) / 현재 시각 (DRAFT)
}

interface TaxInvoicePrintLine {
  month: number              // supplyDate 의 MM (전표 공급일 기준)
  day: number                // supplyDate 의 DD
  itemName: string           // TaxInvoiceLine.itemName
  specification: string      // TaxInvoiceLine.spec (null → '')
  quantity: string           // TaxInvoiceLine.quantity (BigDecimal string)
  unitPrice: string          // TaxInvoiceLine.unitPrice
  supplyAmount: string       // TaxInvoiceLine.supplyAmount
  vatAmount: string          // TaxInvoiceLine.vatAmount
  remark: string             // TaxInvoiceLine.memo (null → '')
}
```

### 7-2. 기존 구현 재사용 선언

`TaxInvoiceView.tsx` 의 아래 헬퍼는 변경 없이 유지:
- `splitDigits11(n)` — 11자리 셀 분리
- `splitDate(iso)` — 연/월/일 분리
- `num(v)` — BigDecimal string → number
- `fmtBizNo(v)` — 사업자번호 포맷
- `DIGIT_LABELS` — 11자리 라벨 배열

`PrintLayout.tsx` 공통 헬퍼:
- `krw(n)` — 천 단위 콤마
- `krDate(iso)` — 한국식 일자
- `toKoreanAmount(n)` — 한글 금액 ("일금 ◯원 정")
- `calcAmounts(supply)` — 공급가액 → 부가세 + 합계

---

## 8. 화면 디자인 spec

### 8-1. TaxInvoiceCreatePage

**라우트**: `/accounting/tax-invoices/new`
**권한**: ACCOUNTANT / MASTER

**레이아웃**:
```
AppHeader (세금계산서 발행)
  └── [저장 - DRAFT] [발행] 버튼

공급받는자 정보 카드
  ├── 거래처 검색 (PartnerSearchCombobox — UUID 미노출, 거래처명 표시)
  ├── 사업자등록번호 (자동 채워짐 / 수동 수정 가능)
  ├── 주소 (자동 채워짐)
  └── 공급일자 (DatePicker — 기본값: 오늘)

라인 테이블 (동적 추가/삭제)
  ├── [+ 행 추가] 버튼
  └── 열: 품목 / 규격 / 수량 / 단가 / 공급가액(자동) / 세액(자동) / 비고 / [삭제]

합계 자동 계산 (read-only)
  ├── 공급가액 합계 (우측 정렬, tabular-nums)
  ├── 부가세 합계
  └── 합계 금액 (굵게)

영수/청구 라디오
비고(적요) 텍스트에어리어 (최대 500자)

[인쇄 미리보기] 버튼 → /accounting/tax-invoices/:id/print
```

**자동 계산 로직**:
- 라인별 공급가액 = 수량 × 단가 (소수점 절사)
- 라인별 세액 = 공급가액 × 10% (소수점 절사)
- 합계 = 모든 라인 합산

**컬러 가이드**:
- 수량/단가 입력 중 실시간 공급가액 갱신 — 애니메이션 없이 즉시 반영
- 라인 삭제 버튼: `var(--color-danger)` 아이콘 (휴지통)
- 발행 버튼: `variant="primary"` (Primary CTA)
- 저장 버튼: `variant="ghost"`

### 8-2. TaxInvoiceDetailPage

**라우트**: `/accounting/tax-invoices/:id`
**권한**: ACCOUNTANT / MASTER

**레이아웃**:
```
AppHeader (세금계산서 상세 | taxInvoiceNo)
  └── Status Badge + 액션 버튼 (status 조건부)

Status 별 액션 버튼:
  DRAFT   → [수정] [발행] [삭제]
  ISSUED  → [인쇄] [취소]
  CANCELLED → [인쇄] (read-only)

공급받는자 정보 (read-only 카드)
라인 테이블 (read-only)
합계 (read-only)
발행일시 / 발행자 / 취소일시 (ISSUED/CANCELLED)
```

**발행 확인 모달**:
- 타이틀: "세금계산서를 발행하시겠습니까?"
- 본문: "발행 후에는 수정이 불가합니다. 계속하시겠습니까?"
- 버튼: [취소] [발행] — 발행 버튼 `variant="danger"`

**취소 확인 모달**:
- 타이틀: "세금계산서를 취소하시겠습니까?"
- 본문: "취소 시 역분개가 자동 생성됩니다."
- 버튼: [닫기] [취소 처리] — 취소 처리 버튼 `variant="danger"`

### 8-3. TaxInvoiceListPage

**라우트**: `/accounting/tax-invoices`
**권한**: ACCOUNTANT / MASTER

**필터 바**:
```
[거래처명 검색] [공급일자 from] ~ [공급일자 to] [Status 드롭다운] [조회] [초기화]
```

**테이블 컬럼**:

| 컬럼 | 정렬 | 비고 |
| --- | --- | --- |
| 발행번호 | left | DRAFT → "임시저장" 표시 (italic) |
| 거래처명 | left | UUID 미노출 |
| 공급일자 | center | YYYY-MM-DD |
| 공급가액 | right | 천 단위 콤마 |
| 부가세 | right | |
| 합계금액 | right | |
| 상태 | center | Status Badge |
| 발행일시 | center | ISSUED 만 표시 |
| 액션 | center | [상세] 버튼 |

**Status Badge 색상** (design-system `<Badge>` 컴포넌트):

| Status | variant | 표시 텍스트 |
| --- | --- | --- |
| DRAFT | neutral | 임시저장 |
| ISSUED | success | 발행완료 |
| CANCELLED | danger | 취소 |

**페이지네이션**: 20건/페이지, 기존 `Pagination` 컴포넌트 재사용.

---

## 9. 5회 Iteration 계획

메모리 가드 `feedback_print_design_iteration.md` 준수 — 단번 완성 가정 금지.

| 회차 | 작업 내용 | 검토 방법 | 완료 기준 |
| --- | --- | --- | --- |
| Iteration 1 | 본 가이드 기반 1차 mock 구현 (TaxInvoiceView.tsx 기존 코드 기준) | FE 에이전트 Edge 캡처 → PR comment 이미지 첨부 | 양식 전체 구조 표시 확인 |
| Iteration 2 | 공급받는자 업태/종목/성명 BE 필드 추가 반영 + 책번호 채번 로직 확인 | 개발책임자 Edge 캡처 검토 | NTS 양식 필드 100% 채워짐 |
| Iteration 3 | 11자리 셀 정렬 / 인쇄 여백 / 테두리 픽셀 미세 조정 | `@media print` 실 인쇄 출력 (또는 Edge 인쇄 미리보기 캡처) | A4 1페이지 내 완전 출력 |
| Iteration 4 | CreatePage 라인 동적 추가 UX / 자동 계산 실시간 반영 검증 | QA 에이전트 시나리오 검증 | 자동 합계 정확도 100% |
| Iteration 5 | ListPage Status badge / 필터 / 페이지네이션 전체 통합 검증 | QA 에이전트 전체 시나리오 + 개발책임자 최종 확인 | legacy 100% 매칭 선언 |

---

## 10. 구현 체크리스트 (Frontend agent)

- [ ] `TaxInvoiceView.tsx` — 기존 1차 mock 에서 BE `TaxInvoiceDetail` 직접 연결 (완료 참고: printApi.ts)
- [ ] `TaxInvoiceCreatePage.tsx` — 라인 동적 추가 / 자동 합계 / DRAFT 저장 / ISSUED 발행 API 연결
- [ ] `TaxInvoiceDetailPage.tsx` — Status 별 액션 버튼 + 확인 모달 + 인쇄 라우트 연결
- [ ] `TaxInvoiceListPage.tsx` — 필터 / Status Badge / 테이블 / 페이지네이션
- [ ] `@media print` CSS 적용 (`print-color-adjust: exact` 포함)
- [ ] `toKoreanAmount()` 한글 금액 출력 (PrintLayout.tsx 기존 헬퍼 재사용)
- [ ] UUID 화면 미노출 — 발행번호 `taxInvoiceNo` / 거래처명만 노출
- [ ] Status Badge 컬러 토큰 준수 (raw hex 0건)
- [ ] Pretendard 9 weight 정상 로드 확인 (design-system fonts/)
- [ ] 인쇄 시 사이드바/헤더 `display: none` 확인

---

## 11. 관련 파일 경로

| 파일 | 역할 |
| --- | --- |
| `clients/desktop/src/renderer/print/TaxInvoiceView.tsx` | 인쇄 양식 View (1차 mock 기존 구현) |
| `clients/desktop/src/renderer/print/PrintLayout.tsx` | 공통 인쇄 shell + COMPANY 상수 + 헬퍼 |
| `clients/desktop/src/renderer/api/printApi.ts` | BE API 타입 (`TaxInvoiceDetail`, `TaxInvoiceLine`) |
| `clients/desktop/src/renderer/styles/global.css` | 전역 토큰 import (`@samhan/design-system/tokens.css`) |
| `docs/migration/legacy-print-forms/` | 레거시 인쇄 양식 PNG — 픽셀 단위 일치 기준 |
| `docs/qa/tax-invoice/` | QA 스크린샷 저장 경로 (PR 본문 첨부용) |
