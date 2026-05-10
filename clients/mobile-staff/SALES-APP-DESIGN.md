# P1-4 영업 Native 앱 디자인 명세

> **슬라이스**: P1-4 영업 native 앱  
> **작성일**: 2026-05-11  
> **Designer**: Designer agent (Samhan Designer role)  
> **참조**: `docs/migration/ecount-reference/` 16 캡처 (이카운트 ERP UX 표준), `src/theme/tokens.ts` (W3+W4+W5+post-W5+W10-1 토큰 1:1 복제), `feedback_integrated_pr_pattern`, `feedback_print_design_iteration`

---

## 0. 범위 요약

| 화면 | 컴포넌트명 | 목적 |
|------|-----------|------|
| 영업 대시보드 | `SalesDashboardScreen` | 오늘 견적/주문 현황 카드 + KPI 요약 |
| 견적서 생성 | `QuotationCreateScreen` | 4-step multi-step form (기본정보 → 거래처 → 품목 → 확인) |
| 거래처 주문 생성 | `PartnerOrderCreateScreen` | 3-step multi-step form (거래처 → 품목 → 확인) |
| 거래처 검색 | `CustomerSearchScreen` | 실시간 검색 + 검색 결과 카드 리스트 |

---

## 1. 디자인 토큰 일람 (raw hex 0건 규칙)

모든 스타일은 `../../theme/tokens.ts` 의 named export 를 통해서만 참조한다. 아래는 P1-4 화면에서 사용하는 토큰 대응표다.

### 1.1 컬러

| 사용처 | 토큰 경로 | 의미 |
|--------|-----------|------|
| 화면 배경 | `colors.surface.app` | `#FAFBFC` neutral gray |
| 카드 배경 | `colors.surface.card` | `#FFFFFF` |
| 섹션 구분 배경 | `colors.surface.subtle` | `#F4F6F8` |
| 선택된 항목 배경 | `colors.surface.selected` | `#EFF6FF` |
| 기본 텍스트 | `colors.ink.primary` | `#1A1F2E` |
| 보조 텍스트 | `colors.ink.secondary` | `#5C6773` |
| placeholder | `colors.ink.tertiary` | `#8A95A4` |
| 흰 텍스트 (버튼 위) | `colors.ink.onPrimary` | `#FFFFFF` |
| 기본 구분선 | `colors.line.default` | `#E1E5EA` |
| 포커스 선 | `colors.line.focus` | `#3B82F6` |
| CTA 버튼 배경 | `colors.action.brand` | `#1E40AF` |
| CTA hover | `colors.action.brandHover` | `#1D4ED8` |
| CTA 눌림 | `colors.action.brandActive` | `#1E3A8A` |
| CTA subtle (보조 버튼) | `colors.action.brandSubtle` | `#DBEAFE` |
| 성공 badge | `colors.state.success` + `colors.state.successBg` | `#10B981` / `#D1FAE5` |
| 경고 badge | `colors.state.warning` + `colors.state.warningBg` | `#F59E0B` / `#FEF3C7` |
| 오류 badge | `colors.state.danger` + `colors.state.dangerBg` | `#EF4444` / `#FEE2E2` |
| 정보 badge | `colors.state.info` + `colors.state.infoBg` | `#3B82F6` / `#DBEAFE` |
| 진행 중 accent | `colors.sliceAccent.pending` | `#f9ab00` |
| 완료 accent | `colors.sliceAccent.success` | `#34a853` |
| 위임/취소 accent | `colors.sliceAccent.deferred` | `#5f6368` |

### 1.2 타이포그래피

| 용도 | 토큰 | 결과값 |
|------|------|--------|
| 화면 제목 (h1) | `typography.fontSize.h1` + `fontWeight.bold` | 24px 700 |
| 섹션 헤더 | `typography.fontSize.xl` + `fontWeight.semibold` | 18px 600 |
| 카드 제목 | `typography.fontSize.lg` + `fontWeight.semibold` | 16px 600 |
| 본문 | `typography.fontSize.base` + `fontWeight.regular` | 14px 400 |
| 보조/라벨 | `typography.fontSize.sm` + `fontWeight.medium` | 13px 500 |
| 캡션/badge | `typography.fontSize.xs` + `fontWeight.semibold` | 12px 600 |
| fontFamily | `typography.fontFamily.sans` | `'Pretendard'` |

### 1.3 간격 / 반경

| 용도 | 토큰 | 값 |
|------|------|---|
| 카드 내부 패딩 | `spacing[4]` | 16px |
| 섹션 패딩 | `spacing[6]` | 24px |
| 행 간격 | `spacing[3]` | 12px |
| 카드 border radius | `radii.card` | 8px |
| 버튼 border radius | `radii.button` | 4px |
| badge border radius | `radii.badge` | 4px |
| 입력 필드 border radius | `radii.md` | 8px |

---

## 2. 공통 컴포넌트 패턴

### 2.1 FormField

이카운트 거래처등록 / 판매입력 / 품목등록 캡처를 기준으로 라벨-입력 2열 레이아웃.

```
[라벨 텍스트 고정 폭 80px]   [TextInput 나머지 width]
```

- 라벨: `typography.fontSize.sm`, `colors.ink.secondary`, `fontFamily: 'Pretendard'`
- 입력: `borderWidth: 1`, `borderColor: colors.line.default`, `borderRadius: radii.md`
- 포커스: `borderColor: colors.line.focus`
- placeholder: `colors.ink.tertiary`
- 비활성: `backgroundColor: colors.surface.subtle`, `colors.ink.tertiary`

### 2.2 StepIndicator (multi-step 공통)

```
[1]──────[2]──────[3]──────[4]
 현재 스텝 = filled circle colors.action.brand
 완료 스텝 = filled circle colors.state.success
 미진입 스텝 = outline circle colors.line.default
 연결선 = colors.line.default / colors.state.success (완료 구간)
```

- 스텝 번호 원형 지름: 28px, `borderRadius: radii.full`
- 스텝 라벨: `typography.fontSize.xs`, `colors.ink.secondary` (현재 = `colors.action.brand`)
- 컨테이너: `paddingHorizontal: spacing[4]`, `paddingVertical: spacing[3]`
- 배경: `colors.surface.card`, `borderBottomWidth: 1`, `borderBottomColor: colors.line.default`

### 2.3 SectionHeader (step 내부 섹션 구분)

이카운트 품목등록 탭 패턴 (기본/품목정보/수량/단가 등) 참조.

```
[섹션 제목 텍스트]
─────────────────────── (구분선)
```

- 텍스트: `typography.fontSize.md`, `fontWeight.semibold`, `colors.ink.primary`
- 구분선: `height: 1`, `backgroundColor: colors.line.default`
- 패딩: `paddingHorizontal: spacing[4]`, `paddingVertical: spacing[3]`
- 배경: `colors.surface.subtle`

### 2.4 PrimaryButton / SecondaryButton

| | Primary | Secondary |
|--|---------|-----------|
| 배경 | `colors.action.brand` | `colors.action.brandSubtle` |
| 텍스트 | `colors.ink.onPrimary` | `colors.action.brandActive` |
| borderRadius | `radii.button` | `radii.button` |
| padding | `spacing[3]` V / `spacing[6]` H | `spacing[3]` V / `spacing[4]` H |
| fontWeight | `fontWeight.semibold` | `fontWeight.semibold` |
| disabled | `opacity: 0.45` | `opacity: 0.45` |

### 2.5 StatusBadge

`badgeStyle()` 헬퍼를 직접 사용. P1-4 추가 매핑:

| 상태 | `BadgeKind` | 표시 텍스트 |
|------|------------|------------|
| DRAFT | `'slicePending'` | 임시저장 |
| SENT | `'info'` | 발송됨 |
| ACCEPTED | `'sliceSuccess'` | 수락됨 |
| REJECTED | `'sliceDeferred'` | 거절됨 |
| CONFIRMED | `'ok'` | 확정됨 |
| CANCELLED | `'sliceDeferred'` | 취소됨 |

### 2.6 SearchInputBar

이카운트 거래처등록 담당자 / 거래처계층그룹 돋보기 검색 패턴.

```
[ 돋보기 아이콘 (16px) ][ TextInput ][ 클리어 버튼 (옵션) ]
```

- 외곽: `borderWidth: 1`, `borderColor: colors.line.default`, `borderRadius: radii.md`
- 포커스: `borderColor: colors.line.focus`
- 높이: 44px (터치 가이드라인 최소값)
- 아이콘: `colors.ink.tertiary`

---

## 3. 화면 1: SalesDashboardScreen

### 3.1 목적

영업직원 앱 진입 첫 화면. 오늘의 견적/주문 현황과 미처리 건수를 요약해 즉시 파악할 수 있게 한다.

### 3.2 화면 레이아웃 (세로 스크롤)

```
┌─────────────────────────────────┐
│ SafeAreaView (surface.app)      │
│ ┌─────────────────────────────┐ │
│ │ HEADER (surface.card)       │ │
│ │  "영업 현황"  h1 bold       │ │
│ │  "오늘 YYYY.MM.DD"  sm sec  │ │
│ │                    [새로고침]│ │
│ └─────────────────────────────┘ │
│                                 │
│ ── KPI 요약 카드 행 ────────── │
│ ┌──────────┐  ┌──────────┐     │
│ │ 견적 N건 │  │ 주문 N건 │     │
│ │  (오늘)  │  │  (오늘)  │     │
│ └──────────┘  └──────────┘     │
│ ┌──────────┐  ┌──────────┐     │
│ │미결재 N건│  │ 완료 N건 │     │
│ │ warning  │  │ success  │     │
│ └──────────┘  └──────────┘     │
│                                 │
│ ── 빠른 실행 ─────────────── │
│ ┌───────────────────────────┐   │
│ │ [견적서 작성] [주문 입력] │   │
│ │ [거래처 검색]             │   │
│ └───────────────────────────┘   │
│                                 │
│ ── 최근 견적 목록 ──────────── │
│ ┌───────────────────────────┐   │
│ │ 견적 #Q2026-001           │   │
│ │ 삼한공조 외 2건  [임시저장]│   │
│ │ 2026-05-11 09:30          │   │
│ └───────────────────────────┘   │
│ (반복)                          │
└─────────────────────────────────┘
```

### 3.3 KPI 카드 스타일

```typescript
// 각 KPI 카드 — 2열 grid (flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3])
card: {
  flex: 1,
  minWidth: '45%',
  backgroundColor: colors.surface.card,
  borderRadius: radii.card,
  padding: spacing[4],
  borderWidth: 1,
  borderColor: colors.line.default,
  shadowColor: '#000',
  shadowOpacity: 0.04,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
}
kpiLabel: {
  fontSize: typography.fontSize.xs,
  color: colors.ink.tertiary,
  fontFamily: typography.fontFamily.sans,
  fontWeight: typography.fontWeight.medium,
}
kpiValue: {
  fontSize: typography.fontSize.xxl,     // 22px
  fontWeight: typography.fontWeight.bold,
  color: colors.ink.primary,
  fontFamily: typography.fontFamily.sans,
  marginTop: spacing[1],
}
// 미결재 카드: borderLeftWidth 4, borderLeftColor: colors.state.warning
// 완료 카드: borderLeftWidth 4, borderLeftColor: colors.state.success
```

### 3.4 빠른 실행 버튼

- "견적서 작성": PrimaryButton, `testID="sales-dashboard-quick-quotation"`
- "주문 입력": SecondaryButton, `testID="sales-dashboard-quick-partner-order"`
- "거래처 검색": SecondaryButton, `testID="sales-dashboard-quick-customer-search"`
- 배치: `flexDirection: 'row'`, `flexWrap: 'wrap'`, `gap: spacing[2]`

### 3.5 최근 견적 목록 카드

```typescript
recentCard: {
  backgroundColor: colors.surface.card,
  borderRadius: radii.card,
  padding: spacing[4],
  marginBottom: spacing[3],
  borderWidth: 1,
  borderColor: colors.line.default,
}
// 카드 상단 행: 견적번호(semibold lg) + StatusBadge
// 카드 중간 행: 거래처명(base ink.primary) + 품목 수 요약(sm ink.secondary)
// 카드 하단 행: 작성일시(xs ink.tertiary) + "상세 보기" link (action.brand)
```

### 3.6 data-testid

| testID | 대상 |
|--------|------|
| `sales-dashboard-header` | 헤더 View |
| `sales-dashboard-refresh` | 새로고침 버튼 |
| `sales-dashboard-kpi-quotation` | 견적 KPI 카드 |
| `sales-dashboard-kpi-order` | 주문 KPI 카드 |
| `sales-dashboard-kpi-pending` | 미결재 KPI 카드 |
| `sales-dashboard-kpi-done` | 완료 KPI 카드 |
| `sales-dashboard-quick-quotation` | 견적서 작성 버튼 |
| `sales-dashboard-quick-partner-order` | 주문 입력 버튼 |
| `sales-dashboard-quick-customer-search` | 거래처 검색 버튼 |
| `sales-dashboard-recent-list` | 최근 견적 FlatList |
| `sales-dashboard-recent-item-${quotationId}` | 견적 카드 (id = 내부 식별자, UI 미노출) |

---

## 4. 화면 2: QuotationCreateScreen

### 4.1 목적

이카운트 판매입력 화면(20260509_091636.png) 참조. 영업직원이 현장에서 견적서를 모바일로 직접 작성한다. 필드 수가 많으므로 4-step multi-step form 으로 분산한다.

### 4.2 Step 구성

| Step | 제목 | 주요 필드 |
|------|------|-----------|
| 1/4 | 기본 정보 | 견적일자, 담당자, 유효기간, 프로젝트, 적요 |
| 2/4 | 거래처 | 거래처 선택 (CustomerSearch 연동), 전화번호, 납품 주소 |
| 3/4 | 품목 | 품목 추가 (ProductSearch), 수량, 단가, VAT, 할인율 |
| 4/4 | 확인 | 전체 요약 + 전송 / 임시저장 |

### 4.3 전체 레이아웃

```
┌─────────────────────────────────┐
│ HEADER (surface.card)           │
│  [< 뒤로]  "견적서 작성"  h1   │
│ ─────────────────────────────── │
│ STEP INDICATOR                  │
│  (1)──(2)──(3)──(4)             │
│  기본 거래처 품목  확인          │
└─────────────────────────────────┘
│ ScrollView (surface.app)        │
│  STEP CONTENT (조건부 렌더링)   │
└─────────────────────────────────┘
│ FOOTER (surface.card)           │
│  [이전]              [다음/완료]│
└─────────────────────────────────┘
```

### 4.4 Step 1: 기본 정보

이카운트 판매입력 헤더 영역(일자/담당자/프로젝트/적요) 참조.

```
섹션: 기본 정보
──────────────────────────
견적일자    [DatePicker 컴포넌트]
담당자      [TextInput — 담당자명]
유효기간    [DatePicker — 견적 만료일]
프로젝트    [TextInput — 선택]
적요        [TextInput multiline — 2줄 max]
```

- 견적일자 기본값: 오늘 날짜 (로컬 timezone)
- DatePicker: 외부 라이브러리 미사용, `TouchableOpacity` + `Modal` 내부 `TextInput` 날짜 입력 패턴 (형식: `YYYY-MM-DD`)
- 담당자: 로그인 사용자 displayName 자동 채움, 수정 가능
- testID: `quotation-step1-date`, `quotation-step1-manager`, `quotation-step1-validity`, `quotation-step1-project`, `quotation-step1-remark`

### 4.5 Step 2: 거래처

이카운트 거래처등록 기본탭(20260509_091522.png) 참조. 거래처 선택은 CustomerSearchScreen 을 bottom sheet 패턴으로 연결.

```
섹션: 거래처 선택
──────────────────────────
거래처      [선택됨: "삼한공조" ] [변경]
            (미선택 시: [거래처 검색] 버튼)
전화번호    [자동 채움 — 수정 가능]
납품 주소   [TextInput multiline]
배송 특이사항[TextInput — optional]
```

- 거래처 선택 후 `surface.selected` 배경으로 강조 (`colors.surface.selected`)
- "변경" 버튼: SecondaryButton xs
- 거래처 미선택 상태에서 다음 스텝 진입 불가 (Next 버튼 disabled)
- testID: `quotation-step2-customer-field`, `quotation-step2-customer-search-btn`, `quotation-step2-phone`, `quotation-step2-address`, `quotation-step2-delivery-note`

### 4.6 Step 3: 품목

이카운트 판매입력 하단 품목 그리드 (품목코드/품목명/규격/수량/단가/공급가액/부가세/적요) 참조.

품목 라인별 카드 방식 (데스크톱 그리드 → 모바일 카드 변환).

```
섹션: 품목 목록
──────────────────────────
┌─────────────────────────────────┐
│ [품목 #1] [삭제 X]              │
│ 품목명: 공조기 C100             │
│ 규격: 1.5P                      │
│ 수량: [__10__]  단위: EA        │
│ 단가: [__50,000__] (VAT포함 □) │
│ 공급가액: 500,000               │
│ 부가세: 50,000                  │
│ 소계: 550,000                   │
└─────────────────────────────────┘
[+ 품목 추가]

──────────────────────────
합계
  공급가액 합계: 500,000
  부가세 합계:  50,000
  총액:         550,000
```

- 품목 검색: `SearchInputBar` → bottom sheet (품목코드/품목명 키워드 검색)
- 수량/단가: `keyboardType="numeric"` TextInput
- VAT포함 체크박스: `borderWidth: 1`, `borderColor: colors.line.default`, checked = `colors.action.brand`
- 공급가액/부가세/소계: 자동 계산, 읽기 전용 (`colors.ink.secondary`)
- 합계 행: `colors.surface.subtle` 배경, `fontWeight.bold`
- 품목 0건 상태에서 다음 스텝 진입 불가
- testID: `quotation-step3-add-product`, `quotation-step3-product-card-${idx}`, `quotation-step3-product-name-${idx}`, `quotation-step3-qty-${idx}`, `quotation-step3-unit-price-${idx}`, `quotation-step3-vat-include-${idx}`, `quotation-step3-total-supply`, `quotation-step3-total-vat`, `quotation-step3-grand-total`

### 4.7 Step 4: 확인

```
섹션: 견적 요약
──────────────────────────
견적일자    2026-05-11
거래처      삼한공조
담당자      홍길동
유효기간    2026-06-10

품목 목록
  1. 공조기 C100 × 10EA — 550,000원
  (이하 생략 — 3건 초과 시 "외 N건" 표시)

─────────────────────
공급가액 합계   500,000
부가세          50,000
총액            550,000
─────────────────────

적요: (있을 시)
```

- 수정 링크: 각 섹션 옆 "수정" 버튼 → 해당 스텝으로 복귀
- 하단: [임시저장] SecondaryButton + [발송] PrimaryButton
- testID: `quotation-step4-summary`, `quotation-step4-save-draft`, `quotation-step4-submit`

### 4.8 Footer 네비게이션

```typescript
footer: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  padding: spacing[4],
  backgroundColor: colors.surface.card,
  borderTopWidth: 1,
  borderTopColor: colors.line.default,
}
// Step 1: [다음만 표시]
// Step 2-3: [이전] [다음]
// Step 4: [이전] [임시저장] [발송]
```

- testID: `quotation-nav-prev`, `quotation-nav-next`, `quotation-nav-draft`, `quotation-nav-submit`

---

## 5. 화면 3: PartnerOrderCreateScreen

### 5.1 목적

이카운트 구매입력 화면(20260509_091652.png) 참조. 거래처가 전화/방문으로 주문한 내용을 영업직원이 현장에서 즉시 입력한다. QuotationCreate 보다 필드 수가 적으므로 3-step.

### 5.2 Step 구성

| Step | 제목 | 주요 필드 |
|------|------|-----------|
| 1/3 | 거래처 | 거래처 선택, 주문일자, 납품 희망일, 담당자 |
| 2/3 | 품목 | 품목 추가, 수량, 단가, VAT |
| 3/3 | 확인 | 요약 + 주문 접수 |

### 5.3 전체 레이아웃

```
┌─────────────────────────────────┐
│ HEADER                          │
│  [< 뒤로]  "주문 입력"  h1     │
│ ─────────────────────────────── │
│ STEP INDICATOR                  │
│  (1)──────(2)──────(3)          │
│  거래처    품목     확인         │
└─────────────────────────────────┘
│ ScrollView                      │
│  STEP CONTENT                   │
└─────────────────────────────────┘
│ FOOTER [이전] [다음/접수]       │
└─────────────────────────────────┘
```

### 5.4 Step 1: 거래처

이카운트 구매입력 헤더(일자/담당자/거래처/입고창고/전화번호/주소) 참조.

```
섹션: 주문 기본 정보
──────────────────────────
거래처      [CustomerSearch 연동] [변경]
주문일자    [DatePicker — 기본: 오늘]
납품 희망일 [DatePicker — optional]
담당자      [자동 채움, 수정 가능]
출하창고    [Picker — 창고 목록 선택]
전화번호    [자동 채움 (거래처), 수정 가능]
주소        [자동 채움 (거래처), 수정 가능]
전진        [TextInput — optional]
후진        [TextInput — optional]
적요        [TextInput multiline — optional]
```

- 출하창고: `Picker` 컴포넌트 (warehouse-service 목록, 기본값: 본사 창고)
- testID: `partner-order-step1-customer-field`, `partner-order-step1-customer-search-btn`, `partner-order-step1-order-date`, `partner-order-step1-delivery-date`, `partner-order-step1-manager`, `partner-order-step1-warehouse`, `partner-order-step1-phone`, `partner-order-step1-address`, `partner-order-step1-remark`

### 5.5 Step 2: 품목

QuotationCreate Step 3 와 동일한 품목 카드 패턴.

```
섹션: 주문 품목
──────────────────────────
[품목 카드 1]
[품목 카드 2]
...
[+ 품목 추가]

──────────────────────────
합계
  공급가액: N원
  부가세:   N원
  총액:     N원
```

- testID: `partner-order-step2-add-product`, `partner-order-step2-product-card-${idx}`, `partner-order-step2-grand-total`

### 5.6 Step 3: 확인

```
섹션: 주문 요약
──────────────────────────
거래처      삼한공조
주문일자    2026-05-11
납품 희망일 2026-05-13
출하창고    본사 창고

품목 목록
  1. 공조기 C100 × 10EA — 550,000원

─────────────────────
총액: 550,000원
─────────────────────

[주문 접수] PrimaryButton
```

- 접수 완료 시 Alert: "주문이 접수되었습니다. 전표번호: SL2026-XXXX"
- testID: `partner-order-step3-summary`, `partner-order-step3-submit`

---

## 6. 화면 4: CustomerSearchScreen

### 6.1 목적

이카운트 거래처등록 목록 + 검색 패턴(20260509_091522.png, 20260509_091541.png) 참조. QuotationCreate Step 2 / PartnerOrderCreate Step 1 에서 bottom sheet 로 연결되며, 독립 화면으로도 사용 가능.

### 6.2 화면 레이아웃

```
┌─────────────────────────────────┐
│ HEADER (surface.card)           │
│  [< 닫기]  "거래처 검색"  h1   │
└─────────────────────────────────┘
│ 검색 바                         │
│  [SearchInputBar]               │
│  placeholder: "거래처명, 코드"  │
└─────────────────────────────────┘
│ 필터 행 (optional)              │
│  [전체] [거래] [미거래]         │
└─────────────────────────────────┘
│ FlatList (surface.app)          │
│  ┌───────────────────────────┐  │
│  │ 삼한공조                  │  │
│  │ 코드: C001  업태: 도매    │  │
│  │ 전화: 02-1234-5678        │  │
│  └───────────────────────────┘  │
│  (반복)                         │
│                                 │
│  ListEmptyComponent:            │
│  "검색 결과가 없습니다"          │
└─────────────────────────────────┘
```

### 6.3 검색 바

```typescript
searchContainer: {
  paddingHorizontal: spacing[4],
  paddingVertical: spacing[3],
  backgroundColor: colors.surface.card,
  borderBottomWidth: 1,
  borderBottomColor: colors.line.default,
}
searchInput: {
  height: 44,
  borderWidth: 1,
  borderColor: colors.line.default,
  borderRadius: radii.md,
  paddingHorizontal: spacing[3],
  fontSize: typography.fontSize.base,
  color: colors.ink.primary,
  fontFamily: typography.fontFamily.sans,
  backgroundColor: colors.surface.app,
}
// 포커스: borderColor: colors.line.focus
```

- 입력 debounce: 300ms (성능 가드)
- 최소 검색 글자 수: 1자 (빈 문자열 = 전체 목록 표시)
- testID: `customer-search-input`

### 6.4 필터 탭

```typescript
filterRow: {
  flexDirection: 'row',
  paddingHorizontal: spacing[4],
  paddingVertical: spacing[2],
  gap: spacing[2],
  backgroundColor: colors.surface.card,
  borderBottomWidth: 1,
  borderBottomColor: colors.line.default,
}
filterBtn: {
  paddingVertical: spacing[1],
  paddingHorizontal: spacing[3],
  borderRadius: radii.full,
  borderWidth: 1,
  borderColor: colors.line.default,
}
filterBtnActive: {
  backgroundColor: colors.action.brand,
  borderColor: colors.action.brandActive,
}
filterBtnLabel: {
  fontSize: typography.fontSize.xs,
  fontWeight: typography.fontWeight.semibold,
  color: colors.ink.secondary,
  fontFamily: typography.fontFamily.sans,
}
filterBtnLabelActive: {
  color: colors.ink.onPrimary,
}
```

- 필터 값: `'all' | 'active' | 'inactive'`
- testID: `customer-search-filter-all`, `customer-search-filter-active`, `customer-search-filter-inactive`

### 6.5 거래처 카드

이카운트 거래처등록 기본탭 필드 (거래처코드/상호/대표자명/업태/전화) 기준.

```typescript
customerCard: {
  backgroundColor: colors.surface.card,
  borderRadius: radii.card,
  padding: spacing[4],
  marginBottom: spacing[2],
  borderWidth: 1,
  borderColor: colors.line.default,
}
customerName: {
  fontSize: typography.fontSize.lg,
  fontWeight: typography.fontWeight.semibold,
  color: colors.ink.primary,
  fontFamily: typography.fontFamily.sans,
}
customerMeta: {
  // 2열: 코드 + 업태
  flexDirection: 'row',
  gap: spacing[3],
  marginTop: spacing[1],
}
customerMetaText: {
  fontSize: typography.fontSize.xs,
  color: colors.ink.secondary,
  fontFamily: typography.fontFamily.sans,
}
customerPhone: {
  fontSize: typography.fontSize.sm,
  color: colors.ink.tertiary,
  fontFamily: typography.fontFamily.sans,
  marginTop: spacing[1],
}
```

- UUID 비공개 가드: 거래처 UUID 는 노출 불가. 화면에는 거래처코드(비즈니스 식별자) 만 표시.
- 카드 선택(onPress): bottom sheet 모드 = 선택 후 콜백 호출 + 시트 닫기. 독립 화면 모드 = 상세 진입.
- 선택 하이라이트: `backgroundColor: colors.surface.selected`
- testID: `customer-search-list`, `customer-search-item-${partnerCode}`, `customer-search-item-name-${partnerCode}`

### 6.6 Bottom Sheet 연동 패턴

QuotationCreate / PartnerOrderCreate 에서 `CustomerSearchScreen` 을 Modal로 감싸는 패턴:

```typescript
// 사용 예 (QuotationCreateScreen Step 2 내)
<Modal
  visible={customerSheetOpen}
  animationType="slide"
  presentationStyle="pageSheet"   // iOS
  onRequestClose={() => setCustomerSheetOpen(false)}
>
  <CustomerSearchScreen
    mode="picker"
    onSelect={(customer) => {
      setSelectedCustomer(customer);
      setCustomerSheetOpen(false);
    }}
    onClose={() => setCustomerSheetOpen(false)}
  />
</Modal>
```

- `mode="picker"` 시 헤더에 [닫기] 버튼 표시, 상단 제목 "거래처 선택"으로 변경
- `mode="standalone"` (default) 시 일반 화면 동작

---

## 7. 네비게이션 통합

`AppRootNavigator.tsx` 의 mode 분기에 `'sales'` 추가 예정.

```typescript
type AppMode = 'estimate' | 'driver' | 'sales';
```

- `mode='sales'` 진입: `SalesTabNavigator` (신규) → 하단 탭 [대시보드 / 견적 / 주문 / 검색]
- 탭 구성:
  | 탭 | 화면 | testID |
  |----|------|--------|
  | 대시보드 | `SalesDashboardScreen` | `sales-tab-dashboard` |
  | 견적 | `QuotationCreateScreen` | `sales-tab-quotation` |
  | 주문 | `PartnerOrderCreateScreen` | `sales-tab-order` |
  | 거래처 | `CustomerSearchScreen` | `sales-tab-customer` |

- 탭 바 스타일: DriverTabNavigator 와 동일 (`colors.surface.card`, `borderTopWidth: 1`, `colors.line.default`)

---

## 8. Pretendard 9 weight 사용 매핑

`usePretendardFontGuarded()` 에 현재 4 weight 등록 (Regular/Medium/SemiBold/Bold). P1-4 화면에서 사용하는 weight:

| 사용처 | weight | 토큰 |
|--------|--------|------|
| 화면 제목 h1 | Bold 700 | `typography.fontWeight.bold` |
| 섹션 헤더 | SemiBold 600 | `typography.fontWeight.semibold` |
| 카드 제목, 버튼 | SemiBold 600 | `typography.fontWeight.semibold` |
| 본문, 입력값 | Regular 400 | `typography.fontWeight.regular` |
| 라벨, 보조 | Medium 500 | `typography.fontWeight.medium` |
| badge, 캡션 | SemiBold 600 | `typography.fontWeight.semibold` |

ExtraLight(200)/Light(300)/ExtraBold(800)/Black(900) 은 P1-4 범위 미사용. W10-5 9 weight 정식 배치 시 `usePretendardFontGuarded` fontMap 확장 필요.

---

## 9. 이카운트 참조 화면 대응표

| 이카운트 캡처 파일 | 대응 P1-4 화면 / 섹션 |
|------------------|----------------------|
| `20260509_091522.png` — 거래처등록 기본탭 | CustomerSearchScreen 카드 필드 기준 |
| `20260509_091541.png` — 거래처등록 거래처정보탭 | CustomerSearchScreen 상세 필드 참조 |
| `20260509_091604.png` — 거래처등록 부가정보탭 | CustomerSearchScreen 추가 필드 참조 |
| `20260509_091636.png` — 판매입력 | QuotationCreateScreen Step 1/2/3 레이아웃 기준 |
| `20260509_091652.png` — 구매입력 | PartnerOrderCreateScreen Step 1 헤더 기준 |
| `20260509_091955.png` — 품목등록 기본탭 | Step 3 품목 카드 필드 기준 (품목코드/품목명/규격/단가) |
| `20260509_092006.png` — 품목등록 품목정보탭 | 품목 검색 bottom sheet 필드 참조 |
| `20260509_091813.png` — 판매 메뉴 구조 | SalesDashboardScreen 빠른 실행 항목 기준 |

---

## 10. 접근성 가드

- 모든 TouchableOpacity 에 `accessibilityLabel` 한국어 명시 (화면 낭독기 지원).
- 입력 필드 `accessibilityLabel` = 라벨 텍스트와 동일.
- 버튼 disabled 상태 = `accessibilityState={{ disabled: true }}`.
- 색상만으로 상태를 구분하는 경우 텍스트 보조 레이블 병기 (이카운트 badge 패턴 일관).

---

## 11. 반복 iteration 계획 (feedback_print_design_iteration 준수)

P1-4 화면은 단번 완성 가정 금지. 아래 5회 iteration 계획:

| 회차 | 내용 |
|------|------|
| 1회 | 본 디자인 명세 (현재) — 레이아웃 / 토큰 / testID 기준선 |
| 2회 | FE 에이전트 mock 구현 후 스크린샷 → 라벨 정렬, 간격 미세 조정 |
| 3회 | QA 에이전트 Edge 캡처 → 이카운트 참조 이미지 pixel 비교 + 차이 목록 |
| 4회 | CSS/StyleSheet-only 미세 정정 (레이아웃 재구성 금지) |
| 5회 | 최종 QA 캡처 → PM 승인 → 통합 PR |

---

## 12. 미결 사항 (Frontend agent 전달)

1. `SalesTabNavigator` 신규 파일 경로: `clients/mobile-staff/src/screens/sales/SalesTabNavigator.tsx`
2. `SalesDashboardScreen`: KPI 데이터 API 엔드포인트 — `partner-order-service` 또는 `dashboard-service` 중 결정 필요
3. `QuotationCreateScreen` Step 3 품목 검색: `inventory-service` GET `/internal/products?keyword=` 엔드포인트 확인 필요
4. `PartnerOrderCreateScreen` 출하창고: `warehouse-service` 또는 `partner-order-service` 창고 목록 엔드포인트 확인 필요
5. `CustomerSearchScreen`: `partner-service` GET `/internal/partners?keyword=` 엔드포인트 — 거래처코드/상호/업태/전화 필드 응답 포함 여부 확인 필요
6. Pretendard 9 weight 중 ExtraLight/Light/ExtraBold/Black OTF asset 배치: W10-5 슬라이스 위임 또는 P1-4 내 선행 배치 결정 필요

---

*본 문서 갱신 이력: 2026-05-11 Designer 최초 작성 (P1-4 영업 native 앱 4화면 디자인 명세 v1)*
