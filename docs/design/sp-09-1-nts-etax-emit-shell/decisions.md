# SP-09-1 NTS e-tax 발행 shell — 디자인 Decisions Log
## Cycle 1 Designer fix · 2026-05-18

---

## 1. NTS 전용 컬러 토큰 신규 등록 (D1)

### 결정
design-system 기존 `--color-success`(#2A9D8F, 청록)는 국세청 공식 녹색(`#0F6523`)과 색상 계통이 달라
NTS 전자세금계산서 맥락을 표현할 수 없다. 별도 `nts` 네임스페이스 토큰 4종을 신규 등록한다.

### 등록 토큰

| 변수명 | 값 | 용도 |
|---|---|---|
| `--color-nts-primary` | `#0F6523` | 국세청 공식 녹색 — 버튼/강조 텍스트 |
| `--color-nts-bg` | `#F0FDF4` | NTS banner/badge 배경 |
| `--color-nts-border` | `#BBF7D0` | NTS banner/badge 테두리 |
| `--color-nts-text` | `#14532D` | NTS banner 본문 텍스트 |

### 파일
- `clients/web/design-system/src/tokens/tokens.css` — `:root` `--color-info` 블록 직후
- `clients/web/design-system/src/tokens/index.ts` — `colors.nts` 객체

### 근거
- 국세청(hometax.go.kr) 공식 녹색 계열 (#0F6523) 1:1 매칭
- WCAG AA: `#14532D` on `#F0FDF4` → 대비비 약 8.2:1 (충족)
- `--color-success`(#2A9D8F)와 명백한 시각 구분 — NTS 전용 맥락 명시

---

## 2. Badge `nts` variant 신규 추가 (D2)

### 결정
`TaxInvoiceStatus` 타입은 BE 계약상 `'DRAFT' | 'ISSUED' | 'CANCELLED'` 3종이며,
NTS 발행 완료를 별도 status로 추가하면 BE 계약 변경이 필요하다.
즉각 적용 가능한 방법으로 `eTaxExternalId` 존재 여부를 FE 파생 상태로 처리하고,
Badge 컴포넌트에 `'nts'` variant를 추가하여 병렬 표시한다.

### 구현
```tsx
{t.eTaxExternalId ? (
  <Badge variant="nts" data-testid="tax-invoice-detail-nts-emitted-badge">
    NTS 발행 완료
  </Badge>
) : null}
```

기존 `STATUS_VARIANT` 매트릭스는 변경하지 않아 BE 타입 호환을 유지한다.

### 파일
- `clients/web/design-system/src/components/Badge/Badge.tsx` — `BadgeVariant` 타입 + `variantClass`
- `clients/web/design-system/src/components/Badge/Badge.module.css` — `.variant-nts` CSS rule

---

## 3. eTaxExternalId monospace 처리 (D3)

### 결정
`DRY-2026-05-001-1747512345678` 형식의 코드형 식별자는 이카운트 참조 화면과 동일하게
monospace 처리한다. `--font-family-mono` 토큰 참조 + `letterSpacing: 0.02em` 적용.

```tsx
<span
  style={{
    fontFamily: 'var(--font-family-mono)',
    fontSize: 'var(--font-size-sm)',
    letterSpacing: '0.02em',
    fontVariantNumeric: 'tabular-nums',
  }}
>
  {t.eTaxExternalId}
</span>
```

---

## 4. confirm modal 비가역성 경고 (D4)

### 결정
NTS 발행은 외부 국세청 시스템 연동으로 본 시스템에서 직접 취소 불가능하다.
이카운트 참조의 "발행 후 수정/취소 불가" 패턴을 채택하되, 국세청 발행 특성에 맞게 문구를 구체화한다.

경고 박스는 `danger` 토큰 (--color-danger-50 배경 / --color-danger-200 테두리 / --color-danger-700 텍스트)
으로 정보 박스(warning 토큰)보다 상위 시각 계층에 배치한다.

```
주의: 발행 후에는 홈택스에서 직접 취소해야 하며, 본 시스템에서는 되돌릴 수 없습니다.
```

---

## 5. NTS 발행 버튼 시각 구분 (D5)

### 결정
"NTS 발행" 버튼은 외부 시스템 연동 특수 CTA로 일반 primary(브랜드 블루) 와 구분이 필요하다.
Button 컴포넌트에 `nts` variant를 추가하는 대신, inline style override로 NTS 녹색 토큰을 적용한다.
(Button 컴포넌트 수정은 5-team review 전에 변경 범위를 최소화하기 위해 inline 정당화)

```tsx
<Button
  variant="primary"
  style={{
    background: 'var(--color-nts-primary)',
    borderColor: 'var(--color-nts-primary)',
    color: '#FFFFFF',
  }}
>
  NTS 발행
</Button>
```

향후 Button 컴포넌트에 `nts` variant를 정식 추가하는 경우, inline style을 제거하고
`variant="nts"` 로 전환한다.

---

## 6. 적용 후 색상 충돌 해소 요약

| 위치 | 이전 | 이후 |
|---|---|---|
| eTaxExternalId banner 배경 | `#F0FDF4` (hardcoded) | `var(--color-nts-bg)` |
| eTaxExternalId banner 테두리 | `#BBF7D0` (hardcoded) | `var(--color-nts-border)` |
| eTaxExternalId `<strong>` 색상 | `#15803D` (hardcoded) | `var(--color-nts-primary)` |
| eTaxExternalId 값 색상 | `#166534` (hardcoded) | `var(--color-nts-text)` |
| eTaxExternalId 값 폰트 | Pretendard (상속) | `var(--font-family-mono)` |
| NTS 발행 버튼 색상 | `--color-brand-500` (#2D77A8) | `var(--color-nts-primary)` (#0F6523) |
| confirm modal 정보 박스 배경 | `#FEF9C3` (hardcoded) | `var(--color-warning-50)` |
| confirm modal 정보 박스 테두리 | `#FDE68A` (hardcoded) | `var(--color-warning-200)` |
| confirm modal 정보 박스 텍스트 | `#78350F` (hardcoded) | `var(--color-warning-800)` |

---

## 7. 미결 항목 (다음 슬라이스 이관)

| 항목 | 이관 사유 |
|---|---|
| D6 — 인라인 색상 4건 (`#6B7280`, `#374151`) 토큰 교체 | 기능 영향 없음, 점진 migration |
| D7 — DRY_RUN ID 구분 표시 | 운영 환경에서만 의미 있음 |
| D8 — 인쇄 route 구현 | 별도 print 슬라이스 |
| D9 — alert() → toast 패턴 | toast 컴포넌트 design-system 등록 선결 |
