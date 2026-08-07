# #1094 S7 — mutation 경로 복귀 identity 보존

일자: 2026-08-07  
대상: 데스크톱 입금보고서 목록·상세·편집·삭제

## 1. 규칙 적용과 원인

S6 진단을 코드로 확인했다. 목록→상세 링크만 `returnTo + returnEntryKey`를 만들었고,
상세의 편집 이동은 state를 전달하지 않았다. 편집 저장은 state 없는 상세 URL을
`replace`했으며, 삭제 성공은 state 없는 무필터 목록을 `replace`했다. 따라서 stale
cache가 아니라 mutation 전이에서 복귀 identity가 끊긴 결함이었다.

S5 규칙을 mutation에도 동일하게 적용했다.

- 상세→편집: `returnTo`와 `returnEntryKey`를 그대로 전달한다.
- 저장 성공: 저장 응답을 단건 cache에 반영하고 목록 query를 `refetchQueries({ type: 'all' })`로 갱신한 뒤, 목록→상세→편집의 두 history entry를 `navigate(-2)`로 되감는다.
- 삭제 성공: 삭제 결과를 목록 query에 먼저 재조회한 뒤 `navigate(-1)`로 원래 목록 entry를 되감는다.
- identity가 없는 직접 진입은 기존 canonical fallback(`replace`)을 유지한다.

`-2`/`-1` 복귀는 원래 목록 history key를 다시 사용하므로 S5의 anchor 1:1 계약과
scroll 소비가 유지된다. 저장 후에도 낡은 목록을 보이지 않게 하려고 단순 invalidate가
아니라 inactive query까지 실제 재조회했다.

## 2. 저장·삭제 복귀와 목록 갱신의 긴장

삭제는 행이 사라지므로 원래 page가 여전히 유효하면 필터·page·scroll을 그대로
보존한다. 삭제로 마지막 행이 없어 page가 유효 범위를 벗어나면 목록 응답의 마지막
유효 page로만 `replace` clamp한다. 필터와 나머지 URL query는 보존한다. 이 선택은
무필터 0페이지로 보내는 것보다 사용자의 검색 문맥을 보존하고, 존재하지 않는 빈
page에 머무르는 것도 피한다.

저장은 서버가 반환한 갱신 row를 단건 cache에 즉시 기록한 다음 목록 query를 재조회한다.
따라서 복귀 시 원래 필터·page·scroll은 유지하면서 저장된 값이 목록에 반영된다.
재조회 실패 시에는 mutation 성공 자체를 되돌리지 않고 React Query의 기존 오류
상태를 따르며, 성공 후 낡은 목록을 의도적으로 표시하지 않는다.

## 3. RED-A / RED-B 및 동시 GREEN

### RED-A 원문

```text
저장 후 복귀 · 삭제 후 복귀 각각 원래 필터·페이지·scroll 로 간다
저장 후 목록에 갱신값이 보인다
```

추가한 회귀:

- 상세 편집 진입이 `returnTo + returnEntryKey`를 전달하는지 검증
- 편집 저장 성공이 `navigate(-2)`로 원래 목록 history entry로 복귀하는지 검증
- 삭제 성공이 무필터 canonical replace가 아니라 `navigate(-1)`인지 검증
- 삭제로 page가 비면 필터를 유지하고 마지막 유효 page로 clamp하는지 검증

저장 경로는 저장 응답을 `['accounting', 'cash-receipt', id]` cache에 기록하고,
`['accounting', 'cash-receipts']` 전체 query를 재조회하도록 구현했다.

### RED-B 원문

```text
S5 가 닫은 D1·D2·D3 가 그대로 닫혀 있다 (④) · ⑤⑥ 그대로
```

RED-B에는 다음 회귀 테스트를 명시적으로 포함했다.

- D1: `RED-B D1: 같은 URL이어도 history entry별 anchor를 분리한다`
- D2: `RED-B D2: 목록 anchor는 1회 소비 후 사라진다`
- D3: `RED-B D3: anchor TTL 24시간과 상한 50을 지킨다`
- 외부 URL은 canonical fallback으로 거부하는 기존 테스트 유지
- 기존 목록 CTA, 삭제·인쇄·검수·복원 관련 동작은 변경하지 않음

### 동시 GREEN 실측

```text
targeted: 4 test files / 38 tests passed
  CashReceiptDetailPage.test.tsx  13
  CashReceiptFormPage.test.tsx    16
  CashReceiptListPage.test.tsx     5
  returnContract.test.ts           4

npm test       GREEN (전체 Vitest)
npm run typecheck GREEN
npm run lint   0 errors, 기존 warning 136건
```

### 신규 파일 목록

```text
docs/dev-reports/2026-08-07-1094-s7-mutation-return-identity.md
```

변경 파일은 신규 파일 외에 다음 7개이며, 모두 기존 S5 경로의 보강·회귀 테스트다.

```text
clients/desktop/src/renderer/routes/CashReceiptDetailPage.tsx
clients/desktop/src/renderer/routes/CashReceiptDetailPage.test.tsx
clients/desktop/src/renderer/routes/CashReceiptFormPage.tsx
clients/desktop/src/renderer/routes/CashReceiptFormPage.test.tsx
clients/desktop/src/renderer/routes/CashReceiptListPage.tsx
clients/desktop/src/renderer/routes/CashReceiptListPage.test.tsx
clients/desktop/src/renderer/utils/returnContract.test.ts
```
