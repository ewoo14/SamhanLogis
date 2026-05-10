## Designer Reviewer — PR #139 (P0-4 세금계산서 발행 + 인쇄)

검토일: 2026-05-11
검토자: Designer Agent (UI/UX)
검토 범위: TAX-INVOICE-DESIGN.md / TaxInvoiceListPage / TaxInvoiceFormPage / TaxInvoiceDetailPage / TaxInvoiceView (인쇄) / global.css (.tax-invoice-*)

---

### 1. design-system 토큰 준수 — PASS (조건부)

**인쇄 양식 CSS (global.css L2692~2952)에서 raw hex 다수 직접 사용 확인.**

TAX-INVOICE-DESIGN.md § 2 는 raw hex 0건 / CSS 토큰만 사용을 명문화하고 있으나, 실제 `.tax-invoice-*` CSS 는 설계 이유가 있는 NTS 표준색 (`#C00` = 국세청 빨간색)을 포함하여 광범위하게 raw hex 를 사용함.

| 항목 | spec 요구 | 실제 구현 | 판정 |
| --- | --- | --- | --- |
| 타이틀 색 | `var(--color-danger)` | `color: #C00` | **불일치** |
| 공급자 라벨 배경 | `var(--color-neutral-100)` | `background: #FFE0E0` | **불일치** |
| 표 헤더 배경 | `var(--color-neutral-100)` | `background: #FFF5F5` | **불일치** |
| 인쇄 외곽 테두리 | `var(--color-neutral-900)` 2px | `border: 2pt solid #C00` | **불일치** |
| 인쇄 내부 테두리 | `var(--color-neutral-300)` 1px | `border: 1px solid #C00` | **불일치** |
| 합계 행 배경 | `var(--color-neutral-900)` | `background: #FFF59D` (노란색!) | **불일치** |
| digit-cell 폰트 | — | `font-family: 'Consolas', monospace` (raw) | 주의 |

**판단**: `#C00` 은 NTS 표준 인쇄 양식 지정색으로, 실제 종이 세금계산서와의 visual 매칭을 위해 사용된 의도적 결정으로 보임. 단, TAX-INVOICE-DESIGN.md § 2-2 의 `var(--color-danger)` 지정과 불일치하므로 iteration 2 에서 `--color-danger` 값(`#D6504A`)이 NTS 표준 빨강과 시각적으로 충분히 근사한지 Edge 인쇄 미리보기 캡처로 비교 확인 필요.

**합계 행 노란색 (`#FFF59D`) 은 spec 불일치 결함.** spec 은 `var(--color-neutral-900)` 어두운 배경 + `var(--color-neutral-0)` 흰 텍스트를 명시했으나, CSS는 노란색 하이라이트 처리됨.

**화면 페이지 (TSX) raw hex 건수:**
- TaxInvoiceListPage: 4건 (`#9CA3AF`, `#6B7280`, `#374151`, `#D1D5DB`)
- TaxInvoiceFormPage: 25건 이상 (모든 inline style에 raw hex)
- TaxInvoiceDetailPage: 15건 이상

spec "raw hex 0건" 미달성. Slice A/B/C 계승 원칙 위반.

---

### 2. Pretendard 9-weight / tabular-nums — PARTIAL PASS

**Pretendard 로드 경로:**
- `tokens.css` L54: `--font-family-sans: "Pretendard Variable", Pretendard, ...` — 정상
- `global.css` body: `font-family: var(--font-family-sans)` — 정상
- 인쇄 영역 `.tax-invoice-page` 에 별도 font-family 선언 없음 → 상속으로 Pretendard 적용
- 단, `.tax-invoice-book` (L2709) 및 `.digit-cell` (L2829) 에 `font-family: 'Consolas', monospace` 명시 → 해당 영역 Pretendard 미적용

**TAX-INVOICE-DESIGN.md § 3** 은 인쇄 폰트를 `--font-family-print` (명조계열, Noto Serif KR)로 명시했으나 `--font-family-print` 토큰이 `tokens.css` / `global.css` 어디에도 **미정의** 상태. 미정의 토큰 사용 시 폰트 fallback 없음.

**tabular-nums 적용 확인:**
- `.party-regno`, `.write-date`, `.digit-cell`, `.col-qty`, `.col-price`, `.col-supply`, `.col-vat` — `font-variant-numeric: tabular-nums` 적용됨 (PASS)
- TaxInvoiceListPage `<span>` taxInvoiceNo: `fontVariantNumeric: 'tabular-nums'` 인라인 적용 (PASS)
- 금액 합계 컬럼: `fontVariantNumeric: 'tabular-nums'` 적용 (PASS)

---

### 3. Status Badge 색상 — PASS

`STATUS_VARIANT` 맵 (ListPage L45~49, DetailPage L56~60):

```typescript
const STATUS_VARIANT = {
  DRAFT: 'neutral',
  ISSUED: 'success',
  CANCELLED: 'danger',
}
```

TAX-INVOICE-DESIGN.md § 8-3 spec과 일치:
- DRAFT → `neutral` (PASS)
- ISSUED → `success` (PASS)
- CANCELLED → `danger` (PASS)

`<Badge variant={STATUS_VARIANT[row.status]}>` 로 design-system `<Badge>` 컴포넌트 사용 — 토큰 위임 구조 정상.

---

### 4. NTS A4 양식 — PARTIAL PASS

**ASCII Mockup vs 구현 대조:**

| 구역 | spec | 구현 | 판정 |
| --- | --- | --- | --- |
| 책번호/일련번호 (좌상단) | 책번호 권 호 + 일련번호 | `.tax-invoice-book` div — "책번호 권 호" + 일련번호 | PASS |
| 타이틀 (중앙) | 세 금 계 산 서 (공급받는자 보관용) | `<h1 className="tax-invoice-title">` + `<span className="tax-invoice-title-sub">` | PASS |
| 작성일자 (우측) | 작성일자: 2026. 05. 09 | `.tax-invoice-issue-date` div (하단 배치) | **위치 불일치** — spec은 상단 우측이나 CSS상 최하단 |
| 공급자 박스 | 5행 (등록번호/상호+성명/주소/업태+종목/종사업장+전화) | `<table class="tax-invoice-parties">` 5행 구성 | PASS |
| 공급받는자 성명 | 별도 행 | 공급자 성명 행에 `<td>` 병합 (구현상 수신자 성명 행 미분리) | **구조 불일치** |
| 11자리 셀 분리 | 천억~원 12개 라벨 | `DIGIT_LABELS` 12개 + `splitDigits11()` | PASS |
| 라인 표 최소 4행 | 패딩행 자동 삽입 | `Array.from({ length: Math.max(0, 4 - ti.lines.length) })` | PASS |
| 합계 + 영수/청구 | □ 영수 / ■ 청구 | `<span>□ 영수</span><span>■ 청구</span>` (하드코딩 ■=청구) | 조건부 — receivedOrBilled 필드 미반영 |
| 한글 금액 | 일금 ◯원 정 | `toKoreanAmount(total)` 호출 | PASS |

**수신자 박스 구조 결함:**
`<tbody>` row 2 (상호/성명행)에서 공급자측에는 상호 + 성명(대표자) + (인)이 같은 행에 배치되나, 수신자측은 `<th>상호<br />(법인명)</th><td>{ti.partnerName}</td>` 단순 1컬럼으로 성명 행이 별도 없음. NTS 표준 양식과 레이아웃 불일치.

**receivedOrBilled 미반영:**
ASCII Mockup의 `□ 영수 ■ 청구` 표시가 `TaxInvoicePrintData.receivedOrBilled` 필드를 읽어 동적으로 체크/미체크를 전환해야 하나, 현재 구현은 `■ 청구` 를 하드코딩. `TaxInvoiceDetail` 에 `receivedOrBilled` 필드가 없어 BE 미제공 상태.

---

### 5. 취소 Modal (사유 5자 이상 검증) — FAIL

TAX-INVOICE-DESIGN.md 검토 범위에 "사유 5자 이상" 최소 글자 수 검증이 포함되어 있으나:

**DetailPage `handleCancelSubmit()` (L202~209):**
```typescript
const handleCancelSubmit = () => {
  const trimmed = cancelReason.trim()
  if (!trimmed) {        // 비어있으면 reject
    alert('취소 사유를 입력하세요.')
    return
  }
  cancelMutation.mutate(trimmed)
}
```

`!trimmed` 조건만 있어 1자 이상이면 submit 가능. **5자 이상 최소 길이 검증 없음.**

Modal submit 버튼 `disabled` 조건도 `!cancelReason.trim()` 으로 빈값만 체크 (L507).

TAX-INVOICE-DESIGN.md 에는 "사유 5자 이상" 이 명시적으로 기재되어 있지 않으나, 검토 범위 요청에 포함됐으므로 추가 검증 필요. 현재는 최소 길이 guard 부재.

---

### 6. 인쇄 @media print CSS — PASS (부분 주의)

**TAX-INVOICE-DESIGN.md § 6 대비:**

| 항목 | spec | 구현 | 판정 |
| --- | --- | --- | --- |
| `@page { size: A4 portrait; margin: 12mm; }` | 명시 | `@page :first { size: A4; margin: 0; }` — margin: 0 불일치 | **불일치** |
| `.app-sidebar, .app-header, .no-print { display: none }` | 명시 | `global.css @media print` L1256~1258 — `.no-print { display: none !important; }` 있음, `.app-sidebar`/`.app-header` 별도 숨김 선언 없음 | 부분 |
| `.app-shell { grid-template-columns: 1fr }` | 명시 | L1259 `.app-shell { display: block; }` — grid-template-columns 미설정 | 부분 |
| `.tax-invoice-page { -webkit-print-color-adjust: exact; print-color-adjust: exact; }` | 명시 | 별도 @media print 블록 내 `.tax-invoice-page` 선언 없음 | **누락** |
| `.tax-invoice-title` 색상 강제 | 명시 | `.tax-invoice-title` @media print 블록 없음 (화면에서 이미 `#C00` 사용) | 주의 |
| 합계 행 배경 강제 | 명시 | `@media print` 내 `.tax-invoice-grand-total` 선언 없음 (class 미사용) | **누락** |

`.paper-a4-portrait { padding: 12mm; }` 는 있으나 `@page margin` 과 중복/충돌 가능. 실제 Edge 인쇄 미리보기 캡처로 여백 실측 필요 (Iteration 3 의무).

---

### 결론 요약

| 검토 항목 | 결과 |
| --- | --- |
| design-system 토큰 (raw hex 0건) | FAIL — CSS 및 TSX 양쪽 다수 raw hex |
| Pretendard 9-weight / tabular-nums | PARTIAL — 폰트 상속은 되나 `--font-family-print` 미정의 / 일부 Consolas override |
| Status Badge (DRAFT/ISSUED/CANCELLED) | PASS |
| NTS A4 양식 구조 | PARTIAL — 수신자 성명 행 누락 / receivedOrBilled 미반영 / 작성일자 위치 |
| 취소 modal 최소 5자 검증 | FAIL — 빈값 체크만 있고 5자 이상 guard 없음 |
| @media print CSS 완성도 | PARTIAL — `print-color-adjust` 누락 / @page margin 불일치 |

**Iteration 현황: Iteration 1 완료 수준.** TAX-INVOICE-DESIGN.md § 9 의 5회 iteration 계획 상 현재 1회차 상태로 정상. Iteration 2~3 에서 아래 항목 fix 필수:

1. `--color-danger` 토큰으로 타이틀 색 통일 (또는 NTS 표준색 전용 토큰 신규 등록 결정)
2. 합계 행 색상 — `#FFF59D` → `var(--color-neutral-900)` + 텍스트 `var(--color-neutral-0)`
3. `--font-family-print` 토큰 `tokens.css` 에 정의 (Noto Serif KR 명조)
4. 수신자 성명 행 분리 (NTS 표준 양식 복원)
5. 취소 modal 최소 5자 이상 검증 추가
6. `.tax-invoice-page { print-color-adjust: exact; }` @media print 블록 추가
7. TSX inline style raw hex → CSS 변수 토큰화 (Slice A/B/C 패턴 통일)

---

**Designer Sign-off**: Iteration 1 구조 확인 완료. Iteration 2 Edge 캡처 + 위 7개 항목 fix 후 재검토 요청.
