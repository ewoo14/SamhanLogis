# Designer Review — SP-09-1 NTS e-tax 발행 shell
## Cycle 1 (read-only) · 2026-05-18 · 검토자: Designer agent

---

## 0. 검토 범위 및 입력 파일

| 파일 | 상태 |
|---|---|
| `clients/desktop/src/renderer/routes/TaxInvoiceDetailPage.tsx` | 읽음 |
| `clients/desktop/src/renderer/api/taxInvoiceApi.ts` | 읽음 |
| `clients/web/design-system/src/tokens/tokens.css` | 읽음 |
| `clients/web/design-system/src/tokens/index.ts` | 읽음 |
| `clients/web/design-system/src/components/Modal/Modal.tsx` | 읽음 |
| `clients/web/design-system/src/components/Modal/Modal.module.css` | 읽음 |
| `clients/web/design-system/src/components/Button/Button.tsx` | 읽음 |
| `clients/web/design-system/src/components/Button/Button.module.css` | 읽음 |
| `clients/web/design-system/src/components/Badge/Badge.tsx` | 읽음 |
| `clients/web/design-system/src/components/Badge/Badge.module.css` | 읽음 |
| `docs/qa/sp-09-1-nts-etax-emit-shell/pr-body.md` | 읽음 |
| 스크린샷 01~04 PNG | 읽음 (내용 없는 단색 PNG — 본문 참고) |

---

## 1. 스크린샷 품질 판정

4장의 PNG 파일 모두 실 UI 렌더링이 없는 단색 배경 이미지(01: blue-tint, 02: cream, 03: mint-green, 04: pink-tint)로만 구성되어 있다. 이는 Playwright 캡처 시점에 React 렌더 트리가 마운트되기 전에 스크린샷이 찍혔거나, mock API 응답이 연결되지 않아 로딩 스피너 단계에서 촬영된 것으로 판단된다.

**결론**: 4장 전부 실 화면 QA 근거 부재. PR 본문에 인라인 첨부된 QA 스크린샷 의무(`feedback_pr_qa_screenshots`) 미충족 상태. 코드 정적 분석으로 검토를 대체하되, 사이클 2 전에 유효 캡처 재촬영이 필요하다.

---

## 2. 검증 항목 매트릭스

| # | 검증 항목 | 판정 | 비고 |
|---|---|---|---|
| 1 | NTS 녹색 `#0F6523` 사용 여부 | **FAIL** | 미사용. 상세 아래 |
| 2 | CTA row 일관성 (간격/배치/포커스 ring) | **WARN** | NTS 발행 버튼 시각 구분 부재 |
| 3 | 상태 기반 렌더링 매트릭스 — EMITTED 상태 | **FAIL** | EMITTED 상태 미정의 |
| 4 | confirm modal UX — 비가역성 강조 | **WARN** | 경고 강도 부족 |
| 5 | eTaxExternalId 표시 — monospace 처리 | **FAIL** | `fontFamily` 지정 없음 |
| 6 | Pretendard 9 weight + 타이포 스케일 | **WARN** | 토큰 이탈 인라인 값 4건 |
| 7 | 인쇄 양식 영향 — 발행 후 세금계산서 변경 | **WARN** | 인쇄 route 미완성 |
| 8 | 접근성 — confirm modal 키보드 포커스/role | **PASS** | Modal.tsx 완전 구현 |

---

## 3. 결함 분류

### D1 — CRITICAL: NTS 녹색 `#0F6523` 미사용

**위치**: `TaxInvoiceDetailPage.tsx` L488, L439~447 / `tokens.css` / `index.ts`

**현황**:
- eTaxExternalId 표시 banner의 `strong` 색상: `color: '#15803D'` (hardcoded)
- eTaxExternalId 값의 색상: `color: '#166534'` (hardcoded)
- NTS 발행 CTA 버튼: `variant="primary"` → `--color-brand-500` (#2D77A8, 브랜드 블루)

**기준**: 국세청(NTS) 공식 녹색 계열인 `#0F6523`은 NTS e-tax 맥락에 한정한 전용 색상으로, design-system 토큰 등록이 필요하다. 현재 `tokens.css` 및 `index.ts`의 success scale은 `#2A9D8F`(teal 계열)로 국세청 공식 녹색과 다르다.

**발견된 색상값 충돌**:
```
tokens.css: --color-success = #2A9D8F (청록)
inline: #15803D (Tailwind green-700)
inline: #166534 (Tailwind green-800)
요구 사양: #0F6523 (국세청 NTS 공식)
```

**권장 fix**:
1. `tokens.css` `:root` 블록에 NTS 전용 토큰 추가:
   ```css
   --color-nts-primary: #0F6523;
   --color-nts-bg:      #F0FDF4;
   --color-nts-border:  #BBF7D0;
   --color-nts-text:    #14532D;
   ```
2. `index.ts`의 `colors` 객체에 `nts` 키 추가
3. `TaxInvoiceDetailPage.tsx` eTaxExternalId banner의 hardcoded 색상을 토큰 참조로 교체
4. NTS 발행 CTA 버튼을 `variant="primary"` 대신 `style={{ background: 'var(--color-nts-primary)', borderColor: 'var(--color-nts-primary)' }}`로 변경하거나, `Button` 컴포넌트에 `nts` variant 추가 검토

---

### D2 — HIGH: EMITTED 상태 누락 — STATUS_VARIANT 매트릭스 불완전

**위치**: `TaxInvoiceDetailPage.tsx` L59~63

**현황**:
```typescript
const STATUS_VARIANT: Record<TaxInvoiceStatus, 'neutral' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  ISSUED: 'success',
  CANCELLED: 'danger',
}
```
`TaxInvoiceStatus` 타입은 `'DRAFT' | 'ISSUED' | 'CANCELLED'` 3종이다. NTS 발행 성공 후(`eTaxExternalId` 채워진 상태)를 별도 상태(`EMITTED`)로 나타낼 수단이 없다.

**문제점**:
- NTS 발행 완료 후에도 Badge는 여전히 `ISSUED`(success, 청록) 색상으로 표시됨
- 사용자가 "이미 국세청에 발행된 문서인가, 단순 발행된 문서인가"를 Badge만으로 구별 불가
- `canEmitNts` 조건이 `!t.eTaxExternalId`로 이미 분기되어 있으나 시각 피드백이 없음

**권장 fix**:
- `STATUS_VARIANT`에 파생 상태 `'EMITTED'` 추가 방법 1: `TaxInvoiceStatus`에 `EMITTED` 추가 (BE와 협의 필요)
- 방법 2 (즉각 가능): `eTaxExternalId` 존재 시 Badge에 별도 아이콘 또는 접미 텍스트 표시:
  ```tsx
  <Badge variant={STATUS_VARIANT[t.status]}>
    {TAX_INVOICE_STATUS_LABEL[t.status]}
    {t.eTaxExternalId ? ' · NTS' : ''}
  </Badge>
  ```
- 방법 3 (권장): `STATUS_VARIANT` 확장 대신 NTS 발행 완료 전용 `<Badge variant="brand">NTS 발행</Badge>` 병렬 표시

---

### D3 — HIGH: eTaxExternalId 표시에 monospace 폰트 미적용

**위치**: `TaxInvoiceDetailPage.tsx` L488~492

**현황**:
```tsx
<span style={{ color: '#166534', fontVariantNumeric: 'tabular-nums' }}>
  NTS 수신 ID: {t.eTaxExternalId}
</span>
```

**문제점**:
- `fontFamily`가 지정되지 않아 Pretendard(proportional sans-serif)로 표시됨
- `eTaxExternalId`는 `DRY-2026-05-001-1747512345678` 형식의 코드형 식별자로, monospace 처리가 필수
- 이카운트 참조 화면에서 코드/번호형 필드는 일관되게 monospace 처리됨
- `tabular-nums`만으로는 문자열 정렬 가독성이 불충분 (특히 하이픈 구분 코드)

**권장 fix**:
```tsx
<span
  style={{
    color: 'var(--color-nts-text)',
    fontFamily: 'var(--font-family-mono)',
    fontSize: 'var(--font-size-sm)',
    letterSpacing: '0.02em',
  }}
>
  {t.eTaxExternalId}
</span>
```

---

### D4 — MEDIUM: confirm modal 비가역성 경고 강도 부족

**위치**: `TaxInvoiceDetailPage.tsx` L680~704 (NTS 발행 Modal 본문)

**현황**:
```tsx
<p style={{ marginTop: 0, fontSize: 13, color: '#374151' }}>
  이 세금계산서를 국세청 전자세금계산서 시스템(NTS)에 발행하시겠습니까?
</p>
<div style={{
  background: '#FEF9C3',
  border: '1px solid #FDE68A',
  color: '#78350F',
  ...
}}>
  DRY_RUN 모드 안내...
</div>
```

**문제점**:
1. `FEF9C3` / `FDE68A` 는 `--state-warning-bg` / hardcoded. design-system 토큰 미사용
2. 비가역성("한 번 발행하면 국세청에 취소 불가") 문구가 없음. 이카운트 참조에서는 세금계산서 발행 확인 modal에 "발행 후에는 수정/취소가 불가합니다" 류의 경고 문구가 명시됨
3. `confirm()` 기반의 일반 발행(L225)과 동일한 modal 구조이나, NTS 발행은 외부 시스템 연동이므로 더 강한 시각 신호가 필요함

**권장 fix**:
```tsx
{/* 비가역성 경고 — danger 토큰 사용 */}
<div
  style={{
    marginBottom: 12,
    padding: '8px 12px',
    background: 'var(--color-danger-50)',
    border: '1px solid var(--color-danger-200)',
    borderRadius: 6,
    fontSize: 12,
    color: 'var(--color-danger-700)',
  }}
>
  <strong>주의</strong>: 국세청 전자세금계산서 발행 후에는 NTS에서 직접 취소해야 합니다.
  이 작업은 되돌릴 수 없습니다.
</div>
```

---

### D5 — MEDIUM: CTA 버튼 행 시각 구분 부재 — NTS 버튼과 일반 버튼 동일 시각 무게

**위치**: `TaxInvoiceDetailPage.tsx` L416~468

**현황**:
```tsx
<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
  {isDraft && canMutate ? <Button variant="ghost">편집</Button> : null}
  {isDraft && canMutate ? <Button variant="primary">발행</Button> : null}
  {canEmitNts ? <Button variant="primary">NTS 발행</Button> : null}
  {isIssued && canMutate ? <Button variant="ghost">취소</Button> : null}
  {(isIssued || ...) ? <Button variant="ghost">인쇄</Button> : null}
</div>
```

**문제점**:
1. ISSUED 상태일 때 "NTS 발행"과 잠재적인 다른 primary 버튼이 동일 `variant="primary"` → 동일 파란색. 시각 계층이 없음
2. "NTS 발행"은 외부 시스템 연동 특수 작업임에도 일반 발행 버튼과 시각적으로 동일 처리
3. 이카운트 참조에서 특수 외부 연동 CTA는 별도 색상 또는 아이콘으로 구분됨
4. ISSUED 상태에서는 "NTS 발행", "취소", "인쇄" 3개 버튼이 동시 표시될 수 있으나 배치 우선순위 명세 없음

**권장 fix**:
- "NTS 발행" 버튼을 NTS 녹색 토큰 적용 (`--color-nts-primary`)
- 또는 버튼 좌측에 NTS 공식 아이콘 SVG 추가 (16px)
- CTA 배치 권장 순서: [NTS 발행 (우선순위 CTA)] | [인쇄] | [취소 (ghost/danger)]

---

### D6 — MEDIUM: 인라인 style 색상 4건 design-system 토큰 이탈

**위치**: `TaxInvoiceDetailPage.tsx`

| 줄 | 현재 값 | 대체 토큰 |
|---|---|---|
| L355 | `color: '#6B7280'` | `var(--color-neutral-500)` |
| L389 | `color: '#6B7280'` | `var(--color-neutral-500)` |
| L397 | `color: '#374151'` | `var(--color-neutral-700)` |
| L559 | `color: '#6B7280'` | `var(--color-neutral-500)` |

**문제점**: `#6B7280`은 `--color-neutral-500`과 1:1 일치하는 값임에도 hardcoded. 다크 테마 전환 시 이 값들은 자동 override가 되지 않는다.

**권장 fix**: 위 4건 모두 CSS 변수 참조로 교체.

---

### D7 — LOW: DRY_RUN 모드 표시가 confirm modal에만 있고 eTaxExternalId banner에 없음

**위치**: `TaxInvoiceDetailPage.tsx` L487~493

**현황**: eTaxExternalId banner는 `<strong>전자세금계산서 국세청 발행</strong>` + ID 표시만 있음. DRY_RUN으로 발행된 ID인 경우에도 동일하게 표시됨.

**문제점**: `DRY-2026-05-001-1747512345678` 형식의 DRY_RUN ID와 실제 NTS ID가 banner에서 동일하게 강조되면, 운영 환경에서 혼란을 야기할 수 있음.

**권장 fix**: `t.eTaxExternalId`가 `DRY-` 접두사로 시작하는 경우 banner 내 "(DRY_RUN)" 텍스트 표시:
```tsx
{t.eTaxExternalId?.startsWith('DRY-') ? (
  <span style={{ fontSize: 11, color: 'var(--color-warning-700)', marginLeft: 8 }}>
    (DRY_RUN — 실제 국세청 발행 아님)
  </span>
) : null}
```

---

### D8 — LOW: 인쇄 양식 미완성 경고 — 세금계산서 print route 미구현

**위치**: `TaxInvoiceDetailPage.tsx` L252~255 (handlePrint 주석)

**현황**:
```tsx
// 후속 iteration 에서 `/accounting/tax-invoices/:id/print` 신규 라우트 추가 예정.
const url = `${window.location.origin}/#/accounting/tax-invoices/${id}/print`
window.open(url, '_blank', 'width=900,height=1200')
```

**문제점**:
- 인쇄 버튼 클릭 시 빈 페이지 또는 404 표시 가능성 높음
- `feedback_print_design_iteration.md` 가드: 인쇄 양식은 3~5회 iteration 필수. 현재 print view 미구현 상태로 iteration 시작 불가
- NTS 발행 완료(`eTaxExternalId` 등록) 후 인쇄물에 NTS 수신 ID가 표시되어야 하나 해당 print 컴포넌트 부재

**권장 fix**:
- SP-09-1 범위 내에서 인쇄 버튼을 비활성화하거나, 미구현 안내 tooltip 표시
- 다음 슬라이스(SP-09-2 또는 별도 print 슬라이스)에서 print view 구현 및 디자인 iteration 착수
- `docs/design/sp-09-1-tax-invoice-print/` 디렉토리 생성 및 인쇄 양식 decisions log 작성 필요

---

### D9 — LOW: STATUS_VARIANT에 'EMITTED' 파생 Badge variant가 없는 상황에서 alert() 사용

**위치**: `TaxInvoiceDetailPage.tsx` L178~188 (emitNtsMutation.onSuccess)

**현황**:
```tsx
alert(
  `전자세금계산서 국세청 발행 완료\n\n` +
  `발행 번호: ${result.taxInvoiceNo ?? '—'}\n` +
  `NTS 수신 ID: ${result.eTaxExternalId ?? '—'}\n\n` +
  `(현재 DRY_RUN 모드 — ...)`
)
```

**문제점**:
- `alert()`는 브라우저 기본 dialog로 UX 일관성을 깨뜨림. 이카운트 참조에서 성공 결과는 toast 또는 inline banner로 처리됨
- NTS 수신 ID가 alert 본문에 포함되나, 사용자가 복사하기 어려움
- `issueMutation.onSuccess`(L138)도 동일한 `alert()` 패턴으로, SP-09-1 이전부터 존재한 문제이나 NTS 발행 완료처럼 중요한 결과에는 특히 부적합

**권장 fix**: 성공 후 `alert()` 대신 화면 내 토스트 또는 eTaxExternalId banner 자체로 피드백 대체. 단, toast 컴포넌트가 design-system에 미등록된 경우 이 항목은 후속 슬라이스로 이관.

---

## 4. 접근성 검증 (PASS 항목 상세)

**PASS**: `Modal.tsx` 구현은 아래를 완전히 충족한다.

- `role="dialog"` — L173
- `aria-modal="true"` — L174
- `aria-labelledby={titleId}` — L175 (title prop 있을 때만)
- `aria-describedby={descId}` — L176 (description prop 있을 때만)
- 포커스 트랩 — `getFocusable()` + Tab 순환 (L126~151)
- 오픈 시 첫 focusable 요소 자동 포커스 (L79~83)
- 클로즈 시 이전 포커스 복원 (L85~90)
- ESC 키 닫기 (L104~114)
- 배경 스크롤 잠금 (L93~101)
- `prefers-reduced-motion` 지원 (Modal.module.css L120~122)
- X 버튼 `aria-label="닫기"` (L193)

**PASS 조건부**: confirm modal 내 "NTS 발행 확인" 버튼에 `data-testid` 있음(L675). 단, emitNtsMutation.isPending 중에 닫기 버튼이 `disabled`되나 ESC도 함께 막혀야 하는지 확인 필요 (`closeOnEsc` 기본값 true로 열려 있음 — 의도된 동작인지 PM 확인 요).

---

## 5. Pretendard 9 weight 토큰 검증

`tokens.css`의 `--font-family-sans` 선언:
```css
"Pretendard Variable", Pretendard, -apple-system, ...
```

`index.ts`의 `typography.fontFamily.sans` 동일 선언 확인. "Pretendard Variable"은 variable font로 9개 weight를 포함한다. design-system의 fontWeight 토큰은 4개(regular/medium/semibold/bold)만 등록되어 있으나, `Pretendard Variable`은 Thin(100)~Black(900) 전 weight를 CSS `font-weight` 숫자 값으로 직접 사용 가능하다.

**WARN**: `TaxInvoiceDetailPage.tsx`의 인라인 `fontSize: 18` (L571) — `var(--font-size-xl)` 토큰값(18px)과 동일하나, 숫자 리터럴이 px 단위 없이 사용됨. React style prop에서 단위 없는 fontSize는 px로 해석되므로 동작은 동일하나, 유지보수 관점에서 CSS 변수 참조 권장.

---

## 6. 권장 fix 우선순위 요약

| 우선순위 | 결함 ID | 내용 | 사이클 2 필수 여부 |
|---|---|---|---|
| P0 | D1 | NTS 녹색 `#0F6523` 토큰 미등록 + hardcoded 이탈 | 필수 |
| P0 | 스크린샷 | 4장 전부 빈 PNG — QA 의무 미충족 | 필수 |
| P1 | D2 | EMITTED 파생 상태 시각 구분 부재 | 필수 |
| P1 | D3 | eTaxExternalId monospace 미적용 | 필수 |
| P2 | D4 | confirm modal 비가역성 경고 문구 누락 | 권장 |
| P2 | D5 | NTS 버튼 시각 계층 구분 없음 | 권장 |
| P3 | D6 | 인라인 색상 4건 토큰 이탈 | 다음 슬라이스 가능 |
| P3 | D7 | DRY_RUN ID 구분 표시 없음 | 다음 슬라이스 가능 |
| P4 | D8 | 인쇄 route 미완성 — print iteration 미착수 | 별도 슬라이스 |
| P4 | D9 | alert() → toast 패턴 교체 | design-system 신규 컴포넌트 선결 |

---

## 7. 사이클 2 착수 조건

1. 스크린샷 4장 재촬영 (실 렌더링 확인)
2. D1 NTS 토큰 등록 (`tokens.css` + `index.ts`)
3. D2 EMITTED 시각 구분 방법 결정 (BE 협의 또는 FE 파생 상태)
4. D3 eTaxExternalId monospace + 토큰 색상 교체
5. D4 confirm modal 비가역성 경고 문구 추가

사이클 2에서 위 5개 항목 fix 후 스크린샷 재캡처 → Designer 재검토 진행.
