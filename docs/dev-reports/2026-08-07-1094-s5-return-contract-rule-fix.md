# 2026-08-07 #1094 S5 — 복귀 계약 규칙 fix

## 결론

따른 규칙은 다음 한 문장이다.

> 복귀 상태는 목록에서 상세로 들어간 그 history entry 하나에만 귀속하고, 그 entry로 되감긴 목록이 상태를 한 번 읽으면 즉시 소비한다.

세 결함을 세 패치로 분리하지 않았다.

- D1: `returnEntryKey`와 scroll storage key를 URL이 아니라 React Router `location.key`로 묶어 같은 pathname+search의 방문을 분리했다.
- D2: 상세의 `목록` CTA는 `returnEntryKey`가 있을 때 `navigate(-1)`로 원래 이동을 되감는다. history state가 없는 새 탭 직접 진입만 canonical URL을 `{ replace: true }`로 사용한다.
- D3: anchor를 JSON(`scrollY`, `createdAt`)으로 저장하고, 읽는 순간 `removeItem`한다. 읽기/쓰기 때 24시간 TTL과 50개 상한을 정리한다.

URL의 필터·페이지는 계속 URL에 남기므로 새로고침·주소 공유 계약은 유지된다. scroll 복귀의 식별자만 history entry로 이동했다.

## RED-A — S4 원문

수정 전 라이브 QA 원문은 S4 보고서에서 다음과 같았다.

```text
RED-A D1
같은 pathname+search 의 history entry 들이 scroll anchor 를 공유해 충돌한다.
다른 화면을 거친 뒤에도 낡은 위치를 복원한다.

RED-A D2
상세의 '목록' CTA 가 history 를 push 해서 목록 ↔ 상세 뒤로/앞으로가기 ping-pong 이 생긴다.

RED-A D3
anchor 에 consume · TTL · 상한이 없어 query 조합별 sessionStorage key 가 계속 누적된다.
```

코드 기준 재현도 동일했다. 기존 key는 `samhan:return-scroll:${pathname}${search}`였고, 상세 CTA는 `navigate(returnTo)`였다.

## RED-B 보존 항목

다음 S4 항목은 변경하지 않았다.

- 새 탭 상세 직접 진입의 canonical fallback과 absolute/protocol-relative 외부 URL 차단
- DRAFT / CONFIRMED / CANCELLED 액션 surface
- Tab 도달, focus ring, accessible name, Enter의 native link 동작
- URL query 필터·페이지 정본, 새로고침·URL 공유
- 필터 3회 변경 후 scroll 520px 복원 경로

상세 `목록` CTA 외의 삭제·확정·취소·편집 분기와 handler는 제거하지 않았다.

## RED → GREEN 검증

수정 전 새 계약 테스트는 다음 실패를 냈다.

```text
returnContract: consume 기대값 null인데 기존 812 반환
returnContract: entry-a에 저장한 520이 entry-b 저장 후 1040으로 덮임
returnContract: 25시간 경과 anchor가 제거되지 않음
CashReceiptDetailPage: 목록 CTA가 -1 대신 returnTo 객체로 navigate
CashReceiptDetailPage: 직접 진입 fallback에 replace 옵션 없음
```

수정 후 변경 파일 참조 테스트는 동시 GREEN이다.

```text
CashReceiptDetailPage.test.tsx   11/11
CashReceiptListPage.test.tsx      4/4
returnContract.test.ts            4/4
합계                            19/19
```

추가된 단정은 history entry 분리, 1회 소비, TTL, 50개 상한, history unwind, direct-entry replace다.

## 50건 초과 생성과 페이지 복귀 실측

실 DB 직접 INSERT는 하지 않았다. 관리자 인증으로 정상 API를 호출해 기존 유효 거래처·계정 코드로 다음을 생성했다.

```text
POST /accounting/cash-receipts
생성 수: 26건
적요 표식: S5-1094-01 … S5-1094-26
생성 전 실 목록: 25건
생성 후 API 실 목록: 51건
페이지 크기: 50
기대 페이지: 2
```

재현에 필요한 데이터 생성 자체는 GREEN이다. 그러나 이 세션의 headless Vite renderer는 권한 API 200 이후에도 대상 URL에서 목록 DOM을 렌더하지 않고 로그인/대시보드로 되돌렸다. 따라서 실제 `2 / 2 → 상세 → 목록 → page=1` DOM과 scroll 수치는 측정하지 않았다. mock 데이터나 우회 state로 실측을 꾸미지 않았으므로 페이지 복귀 게이트는 **판정 불가**로 남긴다.

## 필수 3절

### ① 새로 가능해진 상태·조합과 각각 밟기

단위 테스트로 다음 조합을 모두 밟았다.

| 상태/조합 | 결과 |
|---|---|
| 같은 URL + entry-a anchor | 520 저장·복원 |
| 같은 URL + entry-b anchor | 1040 저장·복원, entry-a와 비충돌 |
| 같은 entry 재조회 | 첫 조회 뒤 `null` |
| 24시간 초과 anchor | 정리 후 `null` |
| 50개 초과 저장 | 가장 오래된 항목 제거 |
| history state + returnEntryKey | `navigate(-1)` |
| state 없는 상세 직접 진입 | canonical `replace` |

실 API에서는 S5 표식 데이터 26건을 정상 경로로 만들고 전체 51건을 확인했다. renderer 인증/권한 redirect 때문에 실제 두 번째 페이지 왕복은 밟지 못했다.

### ② 제거·이동·개명한 식별자 grep 전수

```text
제거: scrollStorageKey(location: ReturnToLocation)
제거: saveScrollAnchor(location: ReturnToLocation, ...)
제거: getScrollAnchor(location: ReturnToLocation)
잔존 호출: saveScrollAnchor(location.key), getScrollAnchor(location.key)만 0이 아닌 정상 참조
URL returnTo: URL 공유·canonical fallback 용도로만 잔존
```

`clients/desktop/src`, `clients/desktop/playwright`, `docs/dev-reports`를 대상으로 `saveScrollAnchor(`, `getScrollAnchor(`, `returnEntryKey`, `returnTo`를 grep했다. 이전 pathname 기반 함수 시그니처와 호출은 0건이다. 과거 S2~S4 보고서의 historical 설명은 보존했다.

### ③ 바꾼 파일을 참조하는 테스트 전부

```text
npm run test -- --run \
  src/renderer/utils/returnContract.test.ts \
  src/renderer/routes/CashReceiptListPage.test.tsx \
  src/renderer/routes/CashReceiptDetailPage.test.tsx
→ 19/19 GREEN

npm run typecheck
→ tsc node/web GREEN
→ real-QA typecheck 50/50 GREEN
```

추가로 `git diff --check`를 실행해 whitespace 오류가 없음을 확인한다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-07-1094-s5-return-contract-rule-fix.md`

수정 파일 목록:

- `clients/desktop/src/renderer/utils/returnContract.ts`
- `clients/desktop/src/renderer/utils/returnContract.test.ts`
- `clients/desktop/src/renderer/routes/CashReceiptListPage.tsx`
- `clients/desktop/src/renderer/routes/CashReceiptDetailPage.tsx`
- `clients/desktop/src/renderer/routes/CashReceiptDetailPage.test.tsx`
