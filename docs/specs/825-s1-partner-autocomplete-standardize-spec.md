# #825 슬1 — 거래처 자동완성 표준화 + ④ 매치필드 하이라이트

- **에픽**: #825 전역 입력 UX · **슬라이스 1/7** · **PR**: (조기 개설) · **일자**: 2026-07-17
- **개발책임자 결정**: 슬1 방향 = A(거래처 표준화 + ④ 하이라이트). 5개 결정 중 ②④ 적용.

## 배경 — 에픽 재프레이밍 (정찰)

거래처 자동완성 **foundation 은 이미 존재**: `PartnerAutocomplete`(design-system, 3필드 표시 name·partnerCode·bizNo + partnerId payload UUID 화면 비노출) 10화면 사용 · `PartnerService.searchAdmin`(partnerCode/name/bizNo LIKE 3필드 검색). → 결정 ②(partnerId payload)·④(3필드 검색)는 거래처 필드엔 대부분 반영됨.

**슬1 실 작업 = ④ 매치필드 하이라이트(갭) + free-text 거래처 입력 감사·파일럿 표준화.**

## 범위 (In-scope) — CODEX SOL 기획검수 반영 재-bound

> 기획검수 BLOCKING 3(파일럿=부분필터·ACCOUNTANT 권한단절·4필드 endpoint) → **슬1 = 하이라이트 foundation + 전수 감사만**. 위험 파일럿·ACCOUNTANT lookup 계약은 감사 기반 슬2.

### 1. ④ 매치필드 하이라이트 foundation (design-system)
- `AsyncAutocomplete` base 에 **하위호환·선택적** `renderOption(item, { query })` 컨텍스트 추가 — 기존 1-인자 renderer 무변경(ProductAutocomplete 등 회귀 0). `candidates`+`resolvedQuery`(후보 생성 검색어) 원자 갱신(stale 강조 방지).
- `PartnerAutocomplete` renderOption 에서 name/partnerCode/bizNo 중 **매치된 모든 필드**에 부분강조 + 필드 배지(숫자 입력 코드 vs 사업자번호 구분).
- **매치 판정 규칙 확정**: BE `searchAdmin` 은 name/code/bizNo/**phone** 4필드 원문 LIKE. 슬1 하이라이트는 **표시 3필드(name/code/bizNo) 원문 대소문자무시 substring 매치**로 FE 재판정(phone-only 매치 후보는 하이라이트 없이 표시·서버 matchedFields 는 슬2 판단). 숫자는 원문 literal 매치(정규화는 슬2).
- **XSS 안전 필수**: `dangerouslySetInnerHTML` 금지 — 원문을 문자열 조각으로 분할해 React text node + `<mark>` 렌더. 테스트: `<img onerror>`·`<script>`·정규식 특수문자(`[`·`.*`)·한/영 대소문자.
- **blast radius 명시**: 하이라이트는 기존 PartnerAutocomplete 전 소비처(10화면)에 전개됨(추가 UI만·동작 무변경). base API 변경은 하위호환이라 Product/generic 회귀 테스트로 무변경 실증.

### 2. 거래처 free-text 입력 전수 감사 (3종 분류)
- 잔존 free-text 거래처 입력을 전수 감사해 **3종 분류**(기획검수):
  - **(a) 즉시 표준화** — 안전한 exact-entity 선택 필드(슬2 대상).
  - **(b) 정당 free-text 유지** — 신규 거래처 생성·부분검색 다건 필터(`거래처 코드` 3화면)·외부 텍스트.
  - **(c) 필수화 슬라이스 이관** — 매출/매입전표 작성 등 "선택 강제 시 전표 필수화 경계 침범" 화면.
- 감사표(화면·라인·분류·근거)를 dev-report/PR 기록. **기존 결함도 기록**: `TaxInvoiceFormPage` 가 bizNo 를 partnerId payload 에 넣음(별도 결함), ACCOUNTANT `partners.search` 권한 단절.

## 범위 외 (Out-of-scope · 후속 슬라이스)
- 슬2 거래처 표준화 전 화면 전개 · 슬3 품목 자동완성·품목 매치하이라이트 · 슬4 칩 복수선택 · 슬5 ① null-semantics(회계 무결성) · 슬6 쪽지 수신자 칩(⑤) · 슬7 주문 병합 UX(③).
- 전표 거래처 필수화(별도 슬라이스)는 조율만(본 슬1은 미선택 저장 차단 미포함).

## 결정·가드
- ② partnerId(UUID) payload·화면 비노출([[feedback_uuid_no_user_visibility]]) — 기존 PartnerOption.id 재사용.
- ④ 3필드 검색(기존) + 매치 하이라이트(신규).
- 단수 강제(거래처=칩 금지).
- 가드: design-system Storybook/테스트(매치 하이라이트) · FE mock suite · 파일럿 화면 계약 테스트 · 라이브 QA(자동완성 3필드·매치표시·선택 payload).

## 검증
- design-system: `npm run typecheck` + vitest(매치 하이라이트 단위) + Storybook 렌더.
- desktop: typecheck + vitest(파일럿 화면·mock parity).
- 라이브 QA: 실 서버 거래처 3필드 검색·매치필드 표시·선택 시 partnerId 필터.
