# AC-3 PartnerAutocomplete — Designer Review Cycle 1

> 검토 기준 브랜치: `feat/ac-3-partner-autocomplete`
> 검토일: 2026-05-31
> 검토자: Designer agent (claude-designer)
> 참조: AC-2 ProductAutocomplete 교훈 (D-1/D-3/D-7)

---

## 1. 요약

PartnerAutocomplete 는 ProductAutocomplete 의 idiom 을 충실히 포팅하였으며, AC-2 에서 수정된 핵심 교훈 3건(D-1 로딩 dropdown, D-3 shadow 토큰, D-7 per-instance seq)이 모두 반영되었다. 다만 SlipFormPage 통합 과정에서 **P0 블로킹 결함 1건**(거래처명 이중 입력 필드 공존)이 발견되었다. CSS 하드코딩 RGBA 값 2건은 P1 수준이다. 전체적으로 디자인 일관성은 양호하나 P0 해소 전 머지 불가이다.

---

## 2. AC-2 교훈 반영 점검

### D-1 — 로딩 시 dropdown 박스 + "검색 중…" 렌더

**반영 확인.**

`PartnerAutocomplete.tsx` L367–384:
```tsx
{showLoadingRow ? (
  <ul id={listId} className={styles['dropdown']} role="listbox" ...>
    <li className={styles['statusRow']} role="option" aria-selected={false}>
      <span className={styles['spinnerDot']} aria-hidden="true" />
      <span>검색 중…</span>
    </li>
  </ul>
) : null}
```
`showLoadingRow = open && status === 'loading' && candidates.length === 0` 조건으로 로딩 상태에 dropdown 박스가 렌더된다. ProductAutocomplete 와 동일 패턴. 통과.

### D-3 — shadow `var(--elev-popover)` 토큰

**반영 확인.**

`PartnerAutocomplete.module.css` L112:
```css
box-shadow: var(--elev-popover);
```
`tokens.css` L260에 `--elev-popover: 0 4px 12px rgba(0, 0, 0, 0.08)` 정의. 토큰 경유. 통과.

### D-7 — per-instance seq (멀티 인스턴스 격리)

**반영 확인.**

`PartnerAutocomplete.tsx` L139–140:
```tsx
const instanceSeq = useRef<number>(0)
const latestSeq = useRef<number>(0)
```
모듈 전역 카운터 없음. useRef 인스턴스별 격리. 주석에 AC-2 교훈 명시(L136–138). 통과.

### AC-1 D-1 — selected + active CSS 충돌

**반영 확인.**

`PartnerAutocomplete.module.css` L141–143:
```css
.optionSelected.optionActive {
  background-color: var(--color-brand-200);
}
```
selected+active 동시 클래스 규칙 존재. ProductAutocomplete 와 동일. 통과.

---

## 3. 거래처 후보 표시 — 색 계층 · 하이라이트 · 키보드 네비

### 3-1. 색 계층

| 요소 | 클래스 | 색 | 비고 |
|---|---|---|---|
| 거래처명 (1차) | `.optionName` | `var(--color-text)` + `font-weight: semibold` | 강조 |
| 구분자 | `.optionSep` | `var(--color-text-subtle)` | muted |
| 거래처 코드 (2차) | `.optionCode` | `var(--color-text-muted)` | tabular-nums |
| 사업자번호 (보조) | `.optionBizNo` | `var(--color-text-subtle)` + `font-size: xs` | 선택적 노출 |

거래처명 1차 강조, 코드 2차 muted, 사업자번호 보조 xs. 의미 계층 명확. **AC-2 와 일관.**

비교: ProductAutocomplete 는 modelName=primary/semibold, productName=muted. 동일 패턴.

### 3-2. 하이라이트 (hover / active)

- hover: `var(--color-brand-50)` — AC-2 동일.
- active(키보드): `var(--color-brand-50)` + `outline: 2px solid var(--color-brand-300)` — AC-2 동일.
- selected: `var(--color-brand-100)` + semibold — AC-2 동일.

일관성 통과.

### 3-3. 키보드 네비

ArrowDown/ArrowUp/Enter/Escape 모두 구현. Enter: `activeIndex >= 0` 이면 해당 항목, 후보 1건이면 자동 선택. AC-2 와 동일. 통과.

---

## 4. 디자인 토큰 점검 — 하드코딩 색/px/shadow

### [P1] focus-within box-shadow RGBA 하드코딩

`PartnerAutocomplete.module.css` L34–35:
```css
.field:focus-within {
  box-shadow: 0 0 0 3px rgba(45, 119, 168, 0.18);
}
```
`rgba(45, 119, 168, 0.18)` 는 `--color-brand-500(#2D77A8)` 의 알파 18% 수작업 값. 토큰 없음. ProductAutocomplete 와 **동일한 값이지만 동일하게 하드코딩**. AC-2 에서도 미수정된 채 포팅됨.

`PartnerAutocomplete.module.css` L47–49:
```css
.hasError:focus-within {
  box-shadow: 0 0 0 3px rgba(214, 80, 74, 0.18);
}
```
`rgba(214, 80, 74, 0.18)` = `--color-danger(#D6504A)` 의 알파 18%. 동일 문제.

**현황**: `tokens.css` 에 `--focus-ring-brand`, `--focus-ring-danger` 등 토큰 미정의. 이 두 값은 ProductAutocomplete 에도 존재하므로 AC-3 신규 발생이 아니나, AC-3 포팅 시에도 수정 기회를 놓쳤음.
**영향**: 브랜드 색 변경 시 두 컴포넌트를 각각 수동 수정해야 함. 일관성 위험.
**등급: [P1]** — 기능 결함 아님. 후속 슬라이스 토큰 추가로 해소 가능.

### 나머지 값: 전부 토큰 경유

- border, background, text, font-size, font-weight, space, radius, z-index(50) — 모두 `var()` 사용.
- `top: calc(100% + 4px)` — 4px 는 dropdown 간격 리터럴. `--space-1(4px)` 와 동치이나 계산식 내에 인라인. 허용 범위(시각적으로 동일).
- 스피너 `14px × 14px`, `border: 2px` — ProductAutocomplete 와 동일 리터럴. 토큰화 대상이나 디자인 변동 빈도 낮음. 허용 범위.

---

## 5. SlipFormPage 통합 — 전표 헤더 배치 / 자동 채움 UX

### [P0 블로킹] 거래처명 이중 입력 필드 공존

**SlipFormPage.tsx L554–579** 의 "헤더 정보" 카드에 기존 수동 `거래처명` input 이 남아 있다:

```tsx
{/* 헤더 정보 카드 */}
<div className="sfp-form-grid sfp-form-grid--2" style={{ marginTop: 16 }}>
  <FormField
    label="거래처명"
    render={({ id }) => (
      <input
        id={id}
        value={partnerName}
        onChange={(e) => setPartnerName(e.target.value)}
        ...
      />
    )}
  />
  ...
</div>
```

동시에 L621–634 의 "거래 명세 정보" 카드에 PartnerAutocomplete 가 존재한다:

```tsx
<PartnerAutocomplete
  value={selectedPartner}
  onChange={(p) => { void handlePartnerAutocompleteChange(p) }}
  searchPartners={searchPartnersApi}
  label="거래처"
  ...
/>
```

사용자는 두 개의 "거래처" 관련 입력 영역을 보게 된다.

- "헤더 정보" 카드의 `거래처명` input → `partnerName` state — 슬립 생성 payload 의 `partnerName` 에 직접 연결.
- "거래 명세 정보" 카드의 `PartnerAutocomplete` → `selectedPartner` state → `handlePartnerAutocompleteChange` 가 1단계로 `setPartnerName(partner.name)` 호출.

즉 두 필드가 **같은 `partnerName` state 를 공유**하므로 자동 채움 시 헤더의 수동 input 도 함께 업데이트된다. 그러나 사용자 관점에서:

1. 상단 "헤더 정보" 카드: `거래처명` 자유 텍스트 입력 가능.
2. 하단 "거래 명세 정보" 카드: `거래처` 자동완성.

두 영역이 동시에 보이면 어느 쪽이 권위(source of truth)인지 불분명. 특히 PartnerAutocomplete 에서 선택 해제(`partner=null`) 시 `setPartnerName('')` 이 호출되어 헤더의 수동 입력값도 지워진다.

**반대 시나리오도 가능**: 사용자가 헤더의 `거래처명` 수동 input 에 직접 타이핑하면 `selectedPartner` 는 여전히 null 또는 이전 선택이므로 두 필드가 불일치 상태에 빠진다.

**UX 원칙 위반**: AC-3 설계 의도는 PartnerAutocomplete 선택 시 자동 채움 → 수동 입력 버튼 제거. 그러나 수동 `거래처명` input 이 헤더 카드에 잔존하여 제거가 이루어지지 않았다.

**등급: [P0]** — 사용자 혼란 + 데이터 불일치 위험. 머지 블로킹.

**권고 수정 방향**: 헤더 정보 카드의 수동 `거래처명` FormField/input 제거. PartnerAutocomplete 를 헤더 카드 상단으로 이동하거나, 두 카드 중 하나를 통합하여 거래처 선택 단일 경로 확보.

### 배치 및 높이 정렬

- PartnerAutocomplete 의 `.field` height: `36px` (CSS L17).
- SlipFormPage 의 `.sfp-input` height: `40px` (global.css L403).
- 두 값이 4px 차이. 같은 카드 내 같은 행에 혼용 시 높이 불일치.

현재 SlipFormPage 에서 PartnerAutocomplete 는 `<div style={{ marginTop: 8 }}>` 단독 행에 위치하며, 같은 행에 `.sfp-input` 과 나란히 놓이지 않는다. 따라서 현재 배치에서는 실제 시각 충돌 없음.

그러나 P0 수정으로 PartnerAutocomplete 를 헤더 카드의 `sfp-form-grid` 안에 이동하면 height 4px 차이가 노출된다. P0 수정 시 함께 조율 필요.
**등급: [P1]** — P0 수정 의존적.

### autoFillLoading 중 disabled 처리

`PartnerAutocomplete disabled={autoFillLoading}` — 2단계 detail fetch 중 컴포넌트 비활성화. 적절하나 로딩 표시(스피너) 없이 단순 disabled 처리. 사용자가 왜 입력이 막히는지 시각적 단서 없음.
**등급: [P2]** — 기능 완결 후 개선 권고.

---

## 6. Storybook 커버리지

| 시나리오 | Story | 커버 |
|---|---|---|
| 기본 검색/선택 | `Default` | 통과 |
| 로딩 상태 (D-1 확인) | `LoadingState` (2초 delay) | 통과 |
| 빈 결과 | `EmptyResults` | 통과 |
| 에러 (reject) | `ErrorState` | 통과 |
| required + error | `RequiredWithError` | 통과 |
| disabled (값 있음) | `Disabled` | 통과 |
| minChars 안내 | `MinChars` (minChars=2) | 통과 |
| 선택 후 blur 복원 | `SelectThenBlur` | 통과 |

총 8개 Story. AC-2 는 7개(SelectThenBlur 포함). AC-3 는 1개 더 많음. 모든 핵심 상태 커버. **통과.**

미커버 항목:
- compact 모드 (label 없이 ariaLabel 만 지정하는 경우) — AC-2 에서도 미커버. P2.
- phone 없는 거래처 (bizNo 없는 경우의 레이아웃) — 미커버. P2.

---

## 7. UUID 비공개 가드

`PartnerOption` 에 UUID 필드 없음. `partnerCode` 가 사용자 표시 식별자. Storybook `Default` story 의 선택 표시도 `name · partnerCode` 만 노출. 통과.

---

## 8. 발견 결함 목록

| ID | 등급 | 파일 | 설명 | 블로킹 |
|---|---|---|---|---|
| D-AC3-01 | **P0** | `SlipFormPage.tsx` L554–579 | 헤더 카드 수동 `거래처명` input 잔존 → PartnerAutocomplete 와 이중 입력 공존, source of truth 불명확 | **머지 블로킹** |
| D-AC3-02 | P1 | `PartnerAutocomplete.module.css` L34 | `rgba(45, 119, 168, 0.18)` 하드코딩 (brand focus-ring) | 미블로킹 |
| D-AC3-03 | P1 | `PartnerAutocomplete.module.css` L48 | `rgba(214, 80, 74, 0.18)` 하드코딩 (danger focus-ring) | 미블로킹 |
| D-AC3-04 | P1 | `SlipFormPage.tsx` / CSS | PartnerAutocomplete `.field` height 36px vs `.sfp-input` 40px 4px 차이 (P0 수정 후 배치 조율 필요) | P0 의존적 |
| D-AC3-05 | P2 | `SlipFormPage.tsx` L631 | `disabled={autoFillLoading}` 중 로딩 피드백 없음 | 미블로킹 |
| D-AC3-06 | P2 | `PartnerAutocomplete.stories.tsx` | compact 모드 Story 미커버 | 미블로킹 |
| D-AC3-07 | P2 | `PartnerAutocomplete.stories.tsx` | phone/bizNo 없는 거래처 Story 미커버 | 미블로킹 |

---

## 9. 결론

**블로킹 finding: 1건 (P0)**

AC-2 교훈 3건(D-1/D-3/D-7)은 모두 AC-3 에 정상 포팅됨. 디자인 토큰 사용, 색 계층, 키보드 네비, Storybook 커버리지 모두 AC-2 와 일관하며 양호.

단, SlipFormPage 통합에서 기존 수동 `거래처명` input 이 제거되지 않아 PartnerAutocomplete 와 **이중 입력 필드가 공존**한다. AC-3 의 핵심 UX 목표(자동완성 단일 경로)가 미달성 상태이며, 데이터 불일치 위험이 있어 **P0 블로킹**으로 판정한다.

P0 수정 후 height 정렬(P1) 을 함께 처리하고 재검토 Cycle 2 진행을 권고한다.
