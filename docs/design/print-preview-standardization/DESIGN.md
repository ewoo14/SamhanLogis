# 전자서명 결재문서 형식 — 공통 인쇄 양식 설계 가이드

작성일: 2026-06-14
작성자: Designer (Samhan Public)
결정 근거: 개발책임자 2026-06-14 구두 결정 (미리보기 표준화 에픽)

---

## 1. 범위 및 분류

### 1-A. 이 양식에서 제외 (기존 유지, 본 가이드 비적용)

기존 법정·거래처 수발 양식은 현행 유지. 임의 변경 금지.

| 양식 | View 파일 | 이유 |
|---|---|---|
| 출고전표 (작업지시서) | `DispatchView.tsx` | 개발책임자 확정 legacy 양식 (SAMSUNG 로고 스트립, 결재란 5칸) |
| 출고전표 (영수증) | `OutboundView.tsx` | 거래처 동봉용, 88mm/A4 분기 유지 |
| 거래명세서 | `InvoiceView.tsx`, `StatementBatchView.tsx` | 법정 양식 아니나 거래처 수발 양식 |
| 세금계산서 | `TaxInvoiceView.tsx`, `SalesInvoicePrintPage.tsx` | 국세청 e-Tax 표준 양식 |
| 매입전표 (PurchaseSlipPrintPage) | `PurchaseSlipPrintPage.tsx` | legacy GAS 100% 매칭 의무 (SP-08) |

### 1-B. 일관화 대상 ("결재문서 형식" 신규 적용)

로고/인감 없이 전자서명 결재란만 포함하는 회사 공식 결재문서.

| 문서 | 현행 View | 현행 결재란 현황 |
|---|---|---|
| 입고전표 | `InboundView.tsx` | `[인]` 텍스트 사인란 3칸 (담당자/검수자/공급처확인) — 전자서명 미적용 |
| 견적서 | `QuoteView.tsx` | `[직인]` 텍스트 사인란 1칸 — 전자서명 미적용 |
| 배차 작업지시서 (그룹웨어 연동용) | `DispatchView.tsx` 파생 신규 | 현행 DispatchView 는 제외 대상. 그룹웨어 결재 첨부 미리보기는 신규 설계 필요 |
| 거래처원장 | `PartnerLedgerView.tsx` | 발행자 footer 만 있음 — 결재란 없음 |
| 분개장 | 미구현 (print-spec.md 설계만) | - |
| 시산표 | 미구현 | - |
| 일반원장 | 미구현 | - |
| 거래처관리대장 | 미구현 | 이카운트 Ⅰ/Ⅱ → 우리는 1종 통합 |
| 손익계산서 | 미구현 | - |
| 재무상태표 | 미구현 | - |
| 부가세 신고 | 미구현 | - |
| 법인세 | 미구현 | - |
| 현금흐름표 | 미구현 | - |
| 자본변동표 | 미구현 | - |
| 일계표 | 미구현 | - |
| 월계표 | 미구현 | - |
| 미수/미지급 현황 | 미구현 | - |

---

## 2. 공통 양식 구조 정의

### 2-A. 전체 레이아웃 (A4 세로 210mm × 297mm)

```
┌─────────────────────────────────────────────────────────────┐  ← margin 12mm
│  [헤더 영역]                                         28mm   │
│                                                             │
│  회사명 (좌, SemiBold 14pt)           문서 제목 (우, Bold 18pt)│
│  사업자번호 XXX-XX-XXXXX              발행일: YYYY년 MM월 DD일│
│  ─────────────────────────────────────────────────────────  │
│  기간: YYYY년 MM월 DD일 ~ YYYY년 MM월 DD일  (해당 문서만)   │
├─────────────────────────────────────────────────────────────┤  ← 구분선 1px
│  [본문 영역]                                    가변 높이    │
│                                                             │
│  (각 View 의 기존 본문 표/내용 그대로 유지)                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 컬럼1 │ 컬럼2 │ ... │ 컬럼N                        │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ 데이터 행                                           │   │
│  │ ...                                                 │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ 합계 행                                             │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤  ← 구분선 1px
│  [결재란 영역]                                       32mm   │
│                                                             │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │  작성    │  검토    │  승인    │  (빈칸)  │  (빈칸)  │  │
│  │          │          │          │          │          │  │
│  │ [서명이미지 또는 빈칸]                               │  │
│  │          │          │          │          │          │  │
│  │ 홍길동   │          │          │          │          │  │
│  │ 2026/06/14 14:32   │          │          │          │  │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘  │
│                                                             │
│  ※ 전자서명으로 결재된 문서입니다.  검증코드: a1b2c3d4     │
└─────────────────────────────────────────────────────────────┘  ← margin 12mm
```

### 2-B. 헤더 영역 상세

**좌측 블록 (회사 정보)**
- 회사명: `useCompanyProfile().company.legalName` — Pretendard SemiBold 14pt, `--ink-primary`
- 사업자번호: `company.businessRegNo` — Regular 10pt, `--ink-secondary`
- 로고: 비표시 (개발책임자 결정 — 결재문서에 로고 없음)
- 인감: 비표시 (개발책임자 결정)

**우측 블록 (문서 식별)**
- 문서 제목: Bold 18pt, `--ink-primary`, 가운데 정렬 (문서마다 다름: "입 고 전 표" 등)
- 문서번호: SemiBold 11pt (`slipNo` 또는 해당 식별자)
- 발행일: Regular 10pt (`krDate()` 포맷 — "YYYY년 MM월 DD일")
- 기간 (회계 문서 한정): Regular 10pt, `periodFrom` ~ `periodTo`

**구분선**
- `1px solid var(--print-line-color)` — `#000`

### 2-C. 결재란 영역 상세

결재란은 **수평 N칸** 배열 (문서별 결재선 수에 따라 2~5칸).

```
┌────────────────────────────────────────────────────────────────┐
│          결    재    란                                         │
├──────────────┬──────────────┬──────────────┬──────────────────┤
│  작  성      │  검  토      │  승  인      │  (문서별 추가)   │
├──────────────┼──────────────┼──────────────┼──────────────────┤
│              │              │              │                  │
│  [서명 영역] │  [서명 영역] │  [서명 영역] │  [서명 영역]    │
│  22mm × 15mm │  22mm × 15mm │  22mm × 15mm │  22mm × 15mm    │
│  (빈칸 or    │              │              │                  │
│   SignatureViewer)          │              │                  │
│              │              │              │                  │
├──────────────┼──────────────┼──────────────┼──────────────────┤
│ 홍길동       │              │              │                  │
│ 2026/06/14   │              │              │                  │
│ 14:32        │              │              │                  │
└──────────────┴──────────────┴──────────────┴──────────────────┘
```

**결재란 토큰 (기존 `--print-approval-*` 확장)**

| 토큰 | 값 | 용도 |
|---|---|---|
| `--print-approval-w-std` | `40mm` | 결재란 칸 너비 (186mm / 최대 4칸 기준, 문서별 조정) |
| `--print-approval-h-std` | `32mm` | 결재란 전체 높이 |
| `--print-approval-label-h` | `6mm` (기존) | 직책/역할 라벨 영역 |
| `--print-approval-sig-h` | `18mm` | 서명 이미지 영역 |
| `--print-approval-name-h` | `8mm` | 이름/서명일시 영역 |
| `--print-approval-label-bg` | `#F0F0F0` (기존) | 라벨 배경 |
| `--print-approval-border` | `1px solid #000` | 결재란 셀 테두리 |

**서명 이미지 규격 (인쇄 내)**
- 최대 너비: `--print-approval-w-std` - 4mm 여백 = `~36mm`
- 최대 높이: `--print-approval-sig-h` = `18mm`
- `object-fit: contain` — 비율 유지
- 미서명 시: 빈 사각 영역 (`background: #fff`, `border: 1px dashed #ccc`)

**서명자 정보 표시 (결재란 하단 셀)**
- 이름: Regular 9pt
- 서명일시: Regular 8pt (`2026/06/14 14:32` — `formatSignedAt()` 활용)
- 검증코드: Mono 7pt, `--ink-tertiary` (signatureHash 앞 8자)

**하단 문구**
```
※ 전자서명으로 결재된 문서입니다.  검증코드: {hash[:8]}
```
Regular 8pt, `--ink-tertiary`, 결재란 아래 4mm 간격

---

## 3. PrintLayout 확장 방안

### 3-A. 현행 PrintLayout 구조 분석

`clients/desktop/src/renderer/print/PrintLayout.tsx` (L60-L88):
- `paper` prop: `a4-portrait` | `a4-landscape` | `receipt-88mm`
- `backTo` prop: 뒤로가기 path
- `children`: 양식 본문 전체
- `showFormatToggle` / `onToggleFormat`: 출고전표/입고전표 전용 토글

현행 구조에서 헤더와 결재란이 children 안에 각 View 가 직접 구현하고 있어 일관성이 없음.

### 3-B. 확장 설계 — `approvalDoc` 슬롯 방식

`PrintLayout` 에 두 개의 선택적 슬롯 prop 추가.

```
PrintLayout props 확장 (설계, 구현은 FE agent 담당):

interface PrintLayoutProps (기존 + 신규)
  ...기존 props 유지...
  /**
   * 결재문서 형식 활성화 여부.
   * true 시 공통 헤더 + 결재란 렌더.
   * false(기본) 시 기존 동작 유지 (제외 대상 문서).
   */
  approvalDoc?: boolean

  /**
   * 결재문서 헤더 정보 — approvalDoc=true 일 때 사용.
   * View 가 이 객체를 내려주면 PrintLayout 이 공통 헤더를 렌더.
   */
  docHeader?: {
    title: string           // "입 고 전 표" / "견 적 서" 등
    docNo?: string          // 문서번호 (slipNo 등)
    issueDate: string       // YYYY-MM-DD
    periodFrom?: string     // YYYY-MM-DD (회계 문서 한정)
    periodTo?: string       // YYYY-MM-DD (회계 문서 한정)
  }

  /**
   * 결재란 칸 정의 — approvalDoc=true 일 때 사용.
   * 각 View 가 결재선을 정의하고 서명 데이터를 내려줌.
   */
  approvalSteps?: ApprovalStep[]
```

```
interface ApprovalStep
  label: string             // "작성" | "검토" | "승인" | "결재" 등
  signerName?: string       // 서명자 이름 (미서명 시 undefined)
  signedAt?: string         // ISO 8601 (미서명 시 undefined)
  signaturePngBase64?: string  // SignatureViewer 에 전달
  signatureHash?: string    // 검증코드 (앞 8자 표시)
```

**opt-out 설계**: `approvalDoc` prop 기본값 = `false`
- 제외 대상 View (DispatchView, OutboundView, InvoiceView, StatementBatchView, TaxInvoiceView, SalesInvoicePrintPage, PurchaseSlipPrintPage) 는 `approvalDoc` prop 미전달로 기존 동작 유지.
- 일관화 대상 View 만 `approvalDoc={true}` + `docHeader` + `approvalSteps` 전달.

### 3-C. 렌더 순서 (approvalDoc=true 시)

```
<PrintLayout approvalDoc docHeader={...} approvalSteps={[...]}>
  {/* children = 본문 표만 (헤더/결재란 제거) */}
  <본문_표 />
</PrintLayout>
```

내부 렌더 순서:
1. 공통 헤더 (`docHeader` 기반 — `useCompanyProfile` 사용)
2. 구분선
3. `{children}` (본문)
4. 구분선
5. 결재란 (`approvalSteps` 기반 — `SignatureViewer` 재사용)
6. 검증 문구

### 3-D. SignatureViewer 재사용 계획

기존 `clients/web/design-system/src/components/SignatureViewer/SignatureViewer.tsx` (L49-L98):
- `signaturePngBase64`, `signerName`, `signedAt`, `signatureHash`, `size` props
- `size='fluid'` 로 결재란 셀 크기에 맞게 조정
- 인쇄 미디어에서 `--signature-img-max-h` CSS 변수로 `18mm` 제한 (새 print 토큰)

미서명 칸 처리: `signaturePngBase64` 빈 문자열 시 `SignatureViewer` 의 `(서명 이미지 없음)` fallback 사용. 인쇄 시에는 빈 사각형으로 표시 (CSS `print` 미디어에서 fallback 텍스트 숨김, 빈 테두리만).

---

## 4. design-system 토큰 일관 적용

### 4-A. 인쇄 공통 토큰 (기존 + 신규)

기존 `--print-*` 토큰 (`tokens.css` L355-L392) 을 그대로 사용. 신규 추가 필요 토큰:

| 토큰명 (신규) | 값 | 용도 |
|---|---|---|
| `--print-approval-w-std` | `40mm` | 결재란 칸 너비 (표준) |
| `--print-approval-h-std` | `32mm` | 결재란 총 높이 |
| `--print-approval-sig-h` | `18mm` | 서명 이미지 영역 높이 |
| `--print-approval-name-h` | `8mm` | 이름/일시 영역 높이 |
| `--print-signature-img-max-h-approval` | `16mm` | 인쇄 시 SignatureViewer img 최대 높이 |
| `--print-doc-header-h` | `28mm` | 공통 헤더 높이 |
| `--print-doc-border` | `1px solid #000` | 헤더/결재란 구분선 |

### 4-B. 타이포그래피

인쇄 양식 전용 — 화면 UI 와 분리. `@media print` 안에서 pt 단위 사용.

| 요소 | 폰트 | 크기 | 굵기 |
|---|---|---|---|
| 헤더 회사명 | Pretendard | 14pt | SemiBold (600) |
| 헤더 문서 제목 | Pretendard | 18pt | Bold (700) |
| 헤더 보조 텍스트 (사업자번호/날짜) | Pretendard | 10pt | Regular (400) |
| 본문 표 헤더 | Pretendard | 11pt | SemiBold (600) |
| 본문 표 데이터 | Pretendard | 10pt | Regular (400) |
| 결재란 라벨 (작성/검토/승인) | Pretendard | 10pt | SemiBold (600) |
| 결재란 서명자명 | Pretendard | 9pt | Regular (400) |
| 결재란 서명일시 | Pretendard | 8pt | Regular (400) |
| 결재란 검증코드 | Mono (`--font-family-mono`) | 7pt | Regular (400) |
| 하단 검증 문구 | Pretendard | 8pt | Regular (400) |
| 합계/총액 강조 | Pretendard | 11pt | Bold (700) |

숫자 컬럼: `font-feature-settings: "tnum" 1, "lnum" 1` (tabular numerals) — 기존 회계 뷰 패턴 유지.

### 4-C. 컬러 (인쇄)

흑백 인쇄 기준. 컬러 프린터 대응은 `@media print` 에서:
- 텍스트: `#000000`
- 테두리: `#000000` (`--print-line-color`)
- 표 헤더 배경: `#F0F0F0` (`--print-thead-bg`)
- 결재란 라벨 배경: `#F0F0F0` (`--print-approval-label-bg`)
- 빈 서명 칸 배경: `#FFFFFF`, 테두리: `1px dashed #CCCCCC`
- 미서명 표시: 비표시 (빈 영역만)

---

## 5. 문서별 결재선 정의 매핑

### 5-A. 전표류

| 문서 | 결재 칸 | 서명 데이터 소스 |
|---|---|---|
| 입고전표 | 작성 / 검토 / 승인 (3칸) | 담당자(`ownerFullName`) / 검수자(`inspector.fullName`) / 승인자(미구현) |
| 견적서 | 작성 / 검토 / 승인 (3칸) | 작성자(`authorName`) / 검토자(미구현) / 승인자(미구현) |

현행 `InboundView.tsx` (L184-L210): 3칸 `[인]` 텍스트 사인란 → 전자서명으로 교체.
현행 `QuoteView.tsx` (L241-L248): `[직인]` 텍스트 → 제거, 전자서명 결재란으로 교체.

### 5-B. 그룹웨어 결재 연동 문서 (배차 작업지시서 파생)

그룹웨어 결재 (`GroupwareApprovalDetailPage.tsx`) 에서 미리보기로 열리는 케이스:
- `approvalSteps` 데이터 소스: `ApprovalLineAdminResponse.steps[]`
- 각 step: `label = approverRole`, `signerName = step.approverName`, `signedAt = step.decidedAt`, `signaturePngBase64 = step.signaturePng` (향후 연동)

현행 `GroupwareApprovalDetailPage.tsx` 에는 미리보기 인쇄 기능 미구현. 별도 슬라이스로 설계.

### 5-C. 회계 재무제표 9종

공통 결재선 (회계 문서 표준):

| 결재 칸 | 직책 | 비고 |
|---|---|---|
| 1 | 작성 | 회계 담당자 |
| 2 | 검토 | 회계팀장 |
| 3 | 승인 | 대표이사 |

재무제표 9종은 현재 미구현 View. 슬라이스 3에서 신규 구현 시 처음부터 `approvalDoc=true` 적용.

### 5-D. 원장류 (거래처원장 / 분개장 / 시산표 / 일반원장)

| 문서 | 결재 칸 |
|---|---|
| 거래처원장 | 작성 / 확인 (2칸) |
| 분개장 | 작성 / 검토 (2칸) |
| 시산표 | 작성 / 검토 / 승인 (3칸) |
| 일반원장 | 작성 / 확인 (2칸) |

현행 `PartnerLedgerView.tsx` (L228-L339): footer 만 있고 결재란 없음 → 일관화 대상 최우선.

### 5-E. 거래처관리대장 (이카운트 통합)

이카운트 Ⅰ (`20260509_091522.png`) + Ⅱ (`20260509_091541.png`) 2종을 우리는 1종 통합:
- 기본 탭: 거래처코드 / 상호 / 대표자명 / 업태 / 전화 / 종목 / FAX / Email / 주소 / 적요
- 거래처정보 탭: 사업자번호 / 거래처코드구분 / 종사업장번호 / 거래처그룹 / 거래유형 (영업/구매)
- 결재란: 작성 / 확인 (2칸) — 대장 등록/변경 시 내부 결재용

---

## 6. 슬라이스 분할 로드맵

### 슬라이스 1 — PrintLayout 결재란 확장 + 전표류 (입고/견적)

**범위**
- `PrintLayout.tsx` prop 확장 (`approvalDoc`, `docHeader`, `approvalSteps`)
- 공통 헤더/결재란 렌더 컴포넌트 신규 (`ApprovalDocHeader`, `ApprovalSignBlock`)
- `tokens.css` 신규 `--print-approval-*` 토큰 5종 추가
- `InboundView.tsx`: `approvalDoc=true` 전환, 3칸 `[인]` → `SignatureViewer`
- `QuoteView.tsx`: `approvalDoc=true` 전환, `[직인]` 제거, 3칸 결재란

**의존**: 현재 `SignatureViewer` 기존 그대로 재사용. 신규 서명 수집 API 불필요 (기존 `slip.inspector.fullName` 등 이름만 표시, signaturePng 미연결은 placeholder).

**결과물**
- `docs/design/print-preview-standardization/DESIGN.md` (본 파일)
- `clients/desktop/src/renderer/print/PrintLayout.tsx` 확장
- `clients/web/design-system/src/tokens/tokens.css` 신규 토큰 5종
- `InboundView.tsx` 결재란 교체
- `QuoteView.tsx` 결재란 교체

**Iteration 가드 적용**: 1차 mock → Edge 캡처 → 3-5회 CSS 미세 조정. 단번 완성 금지.

---

### 슬라이스 2 — 원장류 (거래처원장 / 분개장 / 시산표 / 일반원장) + 거래처관리대장

**범위**
- `PartnerLedgerView.tsx`: `approvalDoc=true` 전환, 결재란 2칸 추가
- 분개장 신규 View (`JournalLedgerView.tsx`): `accounting-slice-A` `print-spec.md` 기존 설계 기반 + 결재란 2칸
- 시산표 신규 View (`TrialBalancePrintView.tsx`): `accounting-slice-A` `print-spec.md` 기반 + 결재란 3칸
- 일반원장 신규 View (`GeneralLedgerPrintView.tsx`): 결재란 2칸
- 거래처관리대장 신규 View (`PartnerRegisterPrintView.tsx`): 이카운트 1+2 통합 필드 + 결재란 2칸

**의존**: 슬라이스 1 완료 (PrintLayout 확장).

---

### 슬라이스 3 — 재무제표 9종

**범위**
- 손익계산서 (`IncomeStatementPrintView.tsx`)
- 재무상태표 (`BalanceSheetPrintView.tsx`)
- 부가세 신고 (`VatReportPrintView.tsx`)
- 법인세 (`CorporateTaxPrintView.tsx`)
- 현금흐름표 (`CashFlowPrintView.tsx`)
- 자본변동표 (`StatementsOfChangesInEquityPrintView.tsx`)
- 일계표 (`DailyClosingPrintView.tsx`)
- 월계표 (`MonthlyClosingPrintView.tsx`)
- 미수/미지급 현황 (`ArApPrintView.tsx`)

모두 `approvalDoc=true` + 결재란 3칸 (작성/검토/승인).

**의존**: 슬라이스 1 완료. BE accounting-service 재무제표 API 구현 선행 필요.

---

## 7. 파일 위치 참조

**분석에 사용된 기존 파일**

| 파일 | 역할 |
|---|---|
| `clients/desktop/src/renderer/print/PrintLayout.tsx` | 공통 인쇄 shell — paper/backTo/children/showFormatToggle |
| `clients/desktop/src/renderer/print/InboundView.tsx` | 입고전표 — L184-L210 사인란 3칸 현행 구현 |
| `clients/desktop/src/renderer/print/QuoteView.tsx` | 견적서 — L241-L248 직인 현행 구현 |
| `clients/desktop/src/renderer/print/DispatchView.tsx` | 출고전표 작업지시서 — 제외 대상 (legacy 유지) |
| `clients/desktop/src/renderer/print/OutboundView.tsx` | 출고전표 영수증 — 제외 대상 |
| `clients/desktop/src/renderer/print/PartnerLedgerView.tsx` | 거래처원장 — 결재란 없음, 슬라이스 2 대상 |
| `clients/desktop/src/renderer/print/useCompanyProfile.ts` | 회사정보 훅 — legalName/businessRegNo/ceo (로고/인감 있으나 미사용) |
| `clients/web/design-system/src/components/SignatureViewer/SignatureViewer.tsx` | 전자서명 표시 컴포넌트 — size='fluid' 재사용 |
| `clients/web/design-system/src/tokens/tokens.css` | 디자인 토큰 — `--print-*` L355-L392 기존, 신규 추가 지점 |
| `docs/design/accounting-slice-A/print-spec.md` | 분개장/시산표 기존 설계 — 슬라이스 2에서 계승 |

**신규 생성 파일 (이 가이드)**
- `docs/design/print-preview-standardization/DESIGN.md` (본 파일)

---

## 8. 이카운트 UX 참조 메모

`docs/migration/ecount-reference/` 16개 캡처에서 확인한 관련 패턴:

- **거래처등록 기본탭** (`20260509_091522.png`): 거래처코드/상호/대표자명/업태/전화/종목/FAX/Email/검색창내용/담당자/주소1,2/거래처계층그룹/적요/특이사항 — 거래처관리대장 필드 기준
- **거래처등록 거래처정보탭** (`20260509_091541.png`): 사업자등록번호/거래처코드구분/종사업장번호/업종별구분/거래유형(영업/구매) — 통합 시 포함 필드
- **판매입력** (`20260509_091636.png`): 일자/거래처/담당자/출하창고/프로젝트/배송주소/입금예정일 헤더 + 품목코드/품목명/규격/수량/단가/공급가액/부가세/적요 라인 — 전표 본문 컬럼 구성 참조
- **사원(담당)등록** (`20260509_092049.png`): 사원코드/사원명/연락처/Email 4필드 — 결재선 담당자 표시 단순화 기준

결재란 디자인은 이카운트 참조 없음 (이카운트 인쇄 양식에 전자서명 결재란 없음). 한국 공공기관 결재문서 표준 (상단 라벨행 + 중간 서명란 + 하단 이름/일시행 수평 N칸) 을 기준으로 설계.

---

## 9. 미결 결정 사항 (FE agent 구현 전 확인 필요)

1. **결재선 연동 API**: 입고전표/견적서의 검토자·승인자 서명 수집은 현행 미구현. 슬라이스 1 에서는 이름만 표시(텍스트), 서명 이미지 없는 빈 칸. 실제 전자서명 연동은 별도 슬라이스 (그룹웨어 결재 연동 후).
2. **결재 칸 수 가변성**: 문서별 2~5칸. `approvalSteps` 배열 길이로 동적 렌더. CSS `grid-template-columns: repeat(N, 1fr)` 적용.
3. **다페이지 처리**: 품목 다량 시 본문이 여러 A4를 차지하는 경우, 결재란은 **마지막 페이지** 에만 렌더. `page-break-inside: avoid` + `CSS print break` 처리 FE 판단.
4. **서명 PNG 해상도**: `SignatureViewer` 가 `max-height: 18mm` 에서 PNG 비율 유지(contain). 50KB PNG hash 기준 (`clients/mobile-staff/src/screens/driver/SignatureScreen` 기존 패턴) — 인쇄 시 충분한 해상도인지 실 캡처 검증 필요.
5. **거래처관리대장 필드 통합 우선순위**: 이카운트 Ⅰ+Ⅱ 통합 시 전체 필드 vs 인쇄 표시 필드 분리 여부. 슬라이스 2 착수 전 개발책임자 확인.
