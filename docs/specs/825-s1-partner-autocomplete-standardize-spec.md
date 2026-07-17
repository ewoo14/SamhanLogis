# #825 슬1 — 거래처 자동완성 표준화 + ④ 매치필드 하이라이트

- **에픽**: #825 전역 입력 UX · **슬라이스 1/7** · **PR**: (조기 개설) · **일자**: 2026-07-17
- **개발책임자 결정**: 슬1 방향 = A(거래처 표준화 + ④ 하이라이트). 5개 결정 중 ②④ 적용.

## 배경 — 에픽 재프레이밍 (정찰)

거래처 자동완성 **foundation 은 이미 존재**: `PartnerAutocomplete`(design-system, 3필드 표시 name·partnerCode·bizNo + partnerId payload UUID 화면 비노출) 10화면 사용 · `PartnerService.searchAdmin`(partnerCode/name/bizNo LIKE 3필드 검색). → 결정 ②(partnerId payload)·④(3필드 검색)는 거래처 필드엔 대부분 반영됨.

**슬1 실 작업 = ④ 매치필드 하이라이트(갭) + free-text 거래처 입력 감사·파일럿 표준화.**

## 범위 (In-scope)

### 1. ④ 매치필드 하이라이트 (design-system)
- `AsyncAutocomplete`/`PartnerAutocomplete` 후보 목록에서 **현재 검색어(q)가 name/partnerCode/bizNo 중 무엇에 매치됐는지 시각 표시**.
- 방식: 매치된 부분 문자열 강조(`<mark>` 류) + 매치 필드 배지(예: 숫자 입력 시 "코드" vs "사업자번호" 구분). 결정 ④ "숫자 입력 시 partnerCode·사업자번호 후보 혼재 → 어느 필드 매치인지 표시".
- design-system 컴포넌트라 재사용(거래처·품목 공통 base `AsyncAutocomplete`에 매치 하이라이트 옵션 추가). 단, 슬1 적용은 **거래처만**(품목은 슬3).
- UUID 비공개 유지(하이라이트는 표시필드만).

### 2. 거래처 free-text 입력 감사 (전 화면)
- free-text 거래처 입력 잔존 화면(정찰 후보 ~10곳)을 전수 감사해 분류:
  - **(a) 표준화 대상** — 거래처 선택/입력 필드 → PartnerAutocomplete(partnerId payload) 이관.
  - **(b) 정당 free-text 유지** — 신규 거래처 생성(PartnerCreatePage)·외부 텍스트·부분검색 필터로 자동완성 부적합.
- 감사표(화면·라인·분류·근거)를 dev-report/PR에 기록.

### 3. 파일럿 표준화 (슬1 = 파일럿 1~3화면)
- 감사 (a) 중 명확한 파일럿: `SalesAccountingSlipPage`·`PurchaseAccountingSlipPage`·`TaxInvoiceBatchIssuePage` 의 `거래처 코드` free-text 필터(:123) → PartnerAutocomplete 3필드 검색으로 표준화(또는 감사 결과 최적 화면).
- **단수 강제** 유지(거래처=단수 귀속키, 칩 미적용). partnerId payload·UUID 비공개.
- 필터 시맨틱(선택 시 partnerCode/partnerId로 필터) 정합.

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
