# AC-3 거래처 자동완성 — FE 사이클2 리뷰

- 리뷰어: Claude FE
- 대상 브랜치: `feat/ac-3-partner-autocomplete`
- 기준 커밋: `796776f0` (Designer P0 fix)
- 날짜: 2026-05-31

---

## 1. Playwright 실제 출력

```
Running 7 tests using 1 worker

[1/7] 시나리오 1: 전표 작성 진입 — 거래처 combobox 렌더 확인
[2/7] 시나리오 2: "엘에이" 입력 → 후보 listbox 표시 (mock /admin/partners/search?q=엘에이)
[3/7] 시나리오 3: 후보 클릭 선택 → 입력란에 거래처명 표시 + 연락처/주소/대표자 채워짐
[4/7] 시나리오 4: 키보드 ArrowDown + Enter 선택 → 거래처명 반영
[5/7] 시나리오 5: UUID 비공개 가드 — 전표작성 화면 UUID 미노출
[6/7] 시나리오 6: 거래처 선택 후 다른 텍스트 입력 blur → 필드 유지 (blur 게이트)
[7/7] 시나리오 7: 존재하지 않는 거래처 검색 → "검색 결과 없음" 표시

  7 passed (9.8s)
```

7/7 PASS 확인.

---

## 2. 사이클1 지적 해소 판정

### P0 D-AC3-01 — 이중입력 통합 (Designer)

**해소 확인.**

`git show 796776f0` 기준:

- 헤더 카드 내 수동 `거래처명` FormField/input 전체 제거됨 (diff `-19 라인`).
- `PartnerAutocomplete`가 헤더 카드(`sfp-card`) 내 단일 위치로 이동.
- `거래 명세 정보` 카드의 중복 `PartnerAutocomplete` 블록 제거됨 (`-14 라인`).
- `autoFillError` 배너도 헤더 카드 내 `PartnerAutocomplete` 바로 아래로 이동 완료.
- 최종 파일(`SlipFormPage.tsx`) 전수 검색: `setPartnerName` 호출은 `handlePartnerAutocompleteChange` 내부 2곳(`partner=null` 클리어, `partner!=null` 1단계 fill)만 존재. 수동 input `onChange`에서 호출하는 경로 없음.

### P1 partnerCode payload — 회귀 아님 확인

**해소 확인.**

- `SlipFormPage.tsx` L437: `partnerName: partnerName.trim() || undefined` — partnerName은 `handlePartnerAutocompleteChange` → `setPartnerName(partner.name)` 에서만 갱신되므로 자동완성 선택 시 정상 전송됨.
- `CreateSlipRequest.java`에 `partnerCode` 필드가 없고 `partnerId(UUID)`만 있음을 주석(L554~562)으로 명시. 설계 의도(denormalize 전송) 회귀 아님 판정 유지.
- 단, `selectedPartner?.partnerCode`로 접근 가능하지만 payload에 전송하지 않는다는 점이 주석으로만 문서화됨 — 추후 BE에서 partnerCode 필드 추가 시 누락 위험이 있으나, 현재 BE 계약 기준으로는 문제 없음.

### P1 D-AC3-02/03 — focus-ring 토큰 교체

**해소 확인.**

`tokens.css` L262-263:
```css
--focus-ring-brand:  0 0 0 3px rgba(45, 119, 168, 0.18);
--focus-ring-danger: 0 0 0 3px rgba(214, 80, 74, 0.18);
```
두 토큰 모두 신규 추가됨.

`PartnerAutocomplete.module.css` L34, L48:
```css
box-shadow: var(--focus-ring-brand);   /* :focus-within */
box-shadow: var(--focus-ring-danger);  /* .hasError:focus-within */
```
하드코딩 `rgba()` 제거, 토큰 참조로 교체됨. 정합 확인.

### P1/P2 searchPartners 에러 — graceful degradation 주석

**해소 확인.**

`partnerApi.ts` L564-568: 4줄 한국어 주석으로 명시:
- ProductAutocomplete의 `searchProductsApi`와 동일 패턴임을 명시
- Storybook `makeMockSearch({ failAfterMs })` 전용 에러 UX와 구분
- `throw` 변경 금지 근거 명시

---

## 3. 신규 결함 / 회귀 검토

### (PASS) 메모 필드 단독 행 처리

`sfp-form-grid--1` 신규 클래스가 `global.css` L402-405에 추가됨:
```css
.sfp-form-grid--1 {
  grid-template-columns: 1fr;
}
```
SlipFormPage L581에서 `<div className="sfp-form-grid sfp-form-grid--1">` 로 메모 FormField를 단독 행으로 감쌈. 그런데 `sfp-form-grid` 베이스 클래스가 `display: grid`를 설정하고 있어, `grid-template-columns: 1fr`이 정상 적용됨. 레이아웃 회귀 없음.

단, 베이스 `sfp-form-grid` 클래스 정의를 확인하면:
```css
.sfp-form-grid {
  display: grid;
  gap: var(--space-4);
  align-items: start;
}
```
`--2`, `--3` modifier와 동일한 패턴으로 `--1`이 추가된 것이므로 일관성 유지됨.

### (PASS) customerTel/Address/Representative — 단일 소스 확인

`handlePartnerAutocompleteChange`에서:
- `partner=null` 시: `setPartnerName('')`, `setCustomerTel('')`, `setCustomerAddress('')`, `setCustomerRepresentative('')`, `setAutoFillError(null)` 모두 클리어됨.
- `partner!=null` 시: 1단계(summary) → `setPartnerName`, `setCustomerTel` 즉시 채움. 2단계(detail fetch) → `setCustomerAddress`, `setCustomerRepresentative` 보강.

수동 input이 제거되었으므로 `거래 명세 정보` 카드의 `거래처 연락처`/`사업장 주소`/`대표자` input은 자동 채움 후 수동 수정만 가능. 단일 소스 원칙 준수.

### (PASS) selectedPartner null 해제 처리

`handleBlur`에서 빈 입력 시 `onChange(null)` 미호출(blur 게이트). `handlePartnerAutocompleteChange(null)` 경로는 `pick(null)` 직접 호출로는 진입 불가 — `PartnerAutocomplete`의 `pick` 함수는 `PartnerOption`만 받음. null 해제는 외부에서 `value=null` prop 으로만 가능한 설계. Playwright 시나리오 6 PASS로 검증됨.

### (PASS) UUID 비공개 가드

`PartnerOption` 인터페이스에 UUID 필드 없음. `partnerCode`는 숫자형 비즈니스 코드. Playwright 시나리오 5 PASS — 선택 후 전체 페이지 텍스트에서 UUID 패턴 미검출.

### (PASS) 다른 필드 레이아웃 회귀 없음

- 기사명/기사 연락처: `sfp-form-grid--driver` 사용(변경 없음).
- 거래처 연락처/주소/대표자: `sfp-form-grid--3` 유지.
- 배송지/검수지/수령자: `sfp-form-grid--3` 유지.
- 결제/할인, 회수/약정, ioType/timeDate: `sfp-form-grid--2` 유지.

### (NOTICE — 비차단) PartnerAutocomplete `status='error'` 실 운영 미노출 설계

`PartnerAutocomplete.tsx` 내부에 `status='error'` 상태는 존재하나, `searchPartnersApi`의 catch가 `[]` 반환이므로 실 운영에서는 `status='done' + candidates=[]` → "검색 결과 없음" 경로만 표시됨. `status='error'` 경로는 Storybook 전용. 주석 명시로 의도가 문서화됨. 차단 사유 없음.

### (NOTICE — 비차단) `sfp-form-grid` 베이스 클래스 `--1` 용도 노출

`--1` modifier가 현재 메모 필드 단독 행 1곳에만 사용됨. 향후 다른 단독 행 필드 추가 시 재사용 가능한 패턴이나, 현재 사용처가 1곳이므로 `<div style={{ marginTop: 16 }}>` 직접 wrapping과 기능 차이 없음. AC-3 범위 내 문제 없음.

---

## 4. 결론

**APPROVE**

사이클1 FE P0(이중입력 이중공존), P1(partnerCode 주석, searchPartners graceful degradation 주석), P1 D-AC3-02/03(focus-ring 토큰) 4건 모두 해소 확인.

Playwright 7/7 PASS (실제 실행 출력 첨부).

신규 결함 없음. NOTICE 2건은 모두 비차단 설계 의도 사항.

**잔여 finding: 0건 (차단 결함 0, NOTICE 2건 비차단)**
