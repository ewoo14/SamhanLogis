# AC-3 PartnerAutocomplete — Designer 사이클2 리뷰

**리뷰 대상 커밋**: 796776f0
**리뷰 파일**:
- `clients/web/design-system/src/components/PartnerAutocomplete/PartnerAutocomplete.tsx`
- `clients/web/design-system/src/components/PartnerAutocomplete/PartnerAutocomplete.module.css`
- `clients/web/design-system/src/tokens/tokens.css`
- `clients/desktop/src/renderer/routes/SlipFormPage.tsx`
- `clients/desktop/src/renderer/styles/global.css`

---

## D-AC3-01 [P0] — 헤더 수동 거래처명 input 이중 공존 해소

**판정: 해소됨**

`SlipFormPage.tsx` render 내 수동 `partnerName` FormField/input 렌더가 완전히 제거되었다.
`PartnerAutocomplete` 는 헤더 정보 카드(`sfp-card`) 내 `<div style={{ marginTop: 16 }}>` 래퍼 안에 단일 배치된다(line 563-579).
`partnerName` state 는 `handlePartnerAutocompleteChange` 에서만 `setPartnerName` 을 호출한다(line 347, 356). 직접 input → setPartnerName 경로 없음.

`거래 명세 정보(e-Count 12 필드)` 카드에는 거래처 선택 UI가 없고 자동 채움 결과인 연락처/주소/대표자 3개 read/edit 필드만 남아있다(line 644-688). 주석에도 "PartnerAutocomplete는 헤더 정보 카드로 단일화, 이 카드에서는 자동 채움 값만 표시/수정"(line 639-641) 명시.

이중 공존 완전 해소. partnerName 단일 소스 정합 확인.

---

## D-AC3-02/03 [P1] — focus-ring 토큰화

**판정: 해소됨**

`tokens.css`(line 262-263):
```css
--focus-ring-brand:  0 0 0 3px rgba(45, 119, 168, 0.18);
--focus-ring-danger: 0 0 0 3px rgba(214, 80, 74, 0.18);
```
두 토큰이 `:root` 블록에 정의되어 있다.

`PartnerAutocomplete.module.css`(line 34, 48):
```css
.field:focus-within {
  box-shadow: var(--focus-ring-brand);
}
.hasError:focus-within {
  box-shadow: var(--focus-ring-danger);
}
```
module.css 가 하드코딩 rgba 값 없이 토큰 참조로 작성되어 있다. D-AC3-02/03 완전 해소.

---

## D-AC3-04 [P1] — height 불일치 (36 vs 40)

**판정: 잔존 — 비블로킹(P1 후속 처리 동의)**

`PartnerAutocomplete.module.css` `.field` height = **36px** (line 17).
`global.css` `.sfp-input` height = **40px** (line 409).

동일 헤더 카드 내 WarehouseSelector / DeliveryTagSelector 와 PartnerAutocomplete 가 혼재하는 경우 PartnerAutocomplete 입력 박스가 4px 작게 보이는 시각 불일치가 존재한다.

단, 사이클1 제기 당시 "P0 통합 후 정렬이 자연스럽다면 비블로킹"으로 합의되었으며, PartnerAutocomplete 가 현재 헤더 카드 내에서 3-column grid 외부(`marginTop: 16` 단독 `div`) 배치이므로 행내 나란히 정렬 문제는 발생하지 않는다. WarehouseSelector height 는 별도 컴포넌트 module.css 에 의존하므로 이번 슬라이스 범위 아님.

잔여 P1(비블로킹). 후속 슬라이스에서 design-system 전체 input height 36/40 통일 작업 시 처리 권고.

---

## 잔여 P2 — autoFillLoading disabled 피드백 / compact · phone-less story

**판정: 비블로킹, 후속 유지**

- `autoFillLoading` 중 `PartnerAutocomplete disabled={autoFillLoading}` 이 적용되어 있으나(line 571) 로딩 중 시각적 피드백(스피너 또는 overlay)이 컴포넌트 외부에 없어 사용자가 대기 중임을 인지하기 어렵다. 비블로킹 P2.
- Storybook story 에 compact 모드(label="") 및 phone 필드 없는 시나리오 story 부재. 비블로킹 P2.

---

## 신규 시각/레이아웃 결함 검사

헤더 카드 단일화 후 레이아웃 변화:
- PartnerAutocomplete 가 3-column grid 외부 단독 행으로 배치되어 좌/우 column 정렬 이슈 없음.
- autoFillError 배너 위치 — PartnerAutocomplete 바로 아래 `marginTop: 8` 배치로 자연스럽다.
- 거래 명세 카드 내 잔여 "거래처 선택" UI가 없어 카드 경계가 명확해졌다.
- 신규 시각 결함 없음.

---

## 종합 결론

| Finding | 우선순위 | 사이클2 판정 |
|---|---|---|
| D-AC3-01 이중 공존 | P0 | **해소됨** |
| D-AC3-02 focus-ring-brand 토큰화 | P1 | **해소됨** |
| D-AC3-03 focus-ring-danger 토큰화 | P1 | **해소됨** |
| D-AC3-04 height 36 vs 40 | P1 | **잔존(비블로킹)** |
| P2 autoFillLoading 피드백 | P2 | 비블로킹 후속 |
| P2 compact/phone-less story | P2 | 비블로킹 후속 |

**블로킹 finding: 0건.**
P0 1건 해소, P1 2건 해소. 잔여 P1 1건(height 36/40) + P2 2건은 비블로킹 후속.
사이클2 Designer 기준 **머지 비블로킹**.
