# #897 입출금·일일 마감 목록 열 계층화

- 작업일: 2026-07-26
- 범위: `BankTransactionPage`, `DailyClosingPage`
- 원칙: 화면 목록만 축소하고 API 원문 모델과 기존 조작 경로는 유지
- 열 후보: 기획서의 화면 의미 기반 제안을 기본값으로 적용

## 1. RED-first 원문

구현 전에 두 화면의 기존 열 계약과 숨김 정보 도달 경로를 검증하는 실패 테스트를 먼저 추가했다.

### Vitest RED

```text
BankTransactionPage 열 계층화 (#897)
  expected: ["선택", "거래일", "적요", "거래처", "입금", "출금", "잔액", "소스", "매칭상태", "상세"]
  received: 기존 11개 열 배열

TestingLibraryElementError: Unable to find an element with the text: 테스트 거래처

DailyClosingPage 열 계층화 (#897)
  expected: ["마감일", "구분", "건수", "금액 합계", "마감상태", "상세", ""]
  received: 기존 세부 분개·계정별 소계·감사 열을 포함한 전체 열 배열
```

두 번째 Bank RED는 테스트 데이터의 거래처가 행 내부 자동완성 입력에만 존재하는 기존 렌더링 구조를 반영하도록 테스트를 조정한 뒤 GREEN으로 전환했다.

### Playwright RED

```text
Bank detail timeout
  mock fixture transactions are 2026-06 data while the page default query range was 2026-07
  => 목록 행이 없어 상세 disclosure를 찾지 못함

Daily detail lookup failed
  expected: [data-testid="daily-closing-detail"]
  actual existing detail wrapper: #daily-closing-detail

좁은 Daily 조작 버튼 검증 실패
  default mock role MANAGER에는 daily-closing.unlock 권한이 없어 reverse button이 렌더되지 않음
```

위 RED는 각각 조회 기간을 fixture 기간으로 명시하고, 기존 일마감 상세 경로를 정확히 가리키며, 권한 회귀는 `mockRole=MASTER`로 검증하도록 수정했다.

## 2. 구현 및 C1~C6 판정

### C1 — 목록 폭

- 두 화면에 핵심 열만 남기는 화면 전용 열 집합을 추가했다.
- `tableLayout="fixed"`와 DataTable의 `secondary` 셀 표시 계약을 유지했다.
- `BANK_TRANSACTION_LIST_COLUMN_KEYS`, `DAILY_CLOSING_LIST_COLUMN_KEYS`를 한 곳에서 정의하고 실제 렌더링 전 `filter`에 적용했다.
- 1600px viewport에서 `tableW ≤ wrapperW`, `scrollW ≤ wrapperW`를 숫자로 검증했다.

### C2 — 감춘 값의 도달성

- Bank: 새 모달을 만들지 않고 각 행의 native `<details>` disclosure를 추가했다. `국민 123-456` 계좌 값과 `파일` 소스 값이 실제 상세에 표시된다.
- Daily: 이미 존재하는 `#daily-closing-detail` 상세 경로를 유지하고 행의 `상세` 버튼이 날짜·구분·소스 필터를 설정한 뒤 해당 상세로 focus/scroll한다.
- 현재 저장소에는 Bank 전용 기존 상세 route가 없었으므로, 모달 대신 행 안의 기본 HTML disclosure를 사용했다.

### C3 — #880 좁은 폭 조작 버튼

- #880(PR #917, `2a1c3a076`)이 고정한 `mobilePriority: 'secondary'`를 유지했다.
- 공유 DataTable이나 design-system을 수정하지 않았다.
- Bank의 기존 `이 거래만 해제`, `매핑도 삭제`, 선택 checkbox 및 일괄조작을 보존했다.
- Daily의 기존 reverse action을 `secondary` 열로 보존했다.
- 375px mock viewport에서 Bank 해제 버튼과 MASTER Daily reverse 버튼이 DOM에 존재하고 enabled 상태이며, Playwright `click({ trial: true })` actionability 검사도 통과함을 확인했다.

### C4 — 인쇄·엑셀

- 이번 변경은 화면 표의 열 집합에만 적용했다. API raw row는 그대로 유지한다.
- 저장소를 조사한 결과 두 대상 화면에는 별도 인쇄·엑셀 export surface가 없었다. 따라서 새 export를 만들거나 기존 export 열을 축소하지 않았다.
- 실제 export 산출물 열 수 검증은 이 저장소에 대상 surface가 없어 수행 대상이 아니었다.

### C5 — `소스`·`매칭상태`

- 기존 탭별 조건부 표시를 보존했다.
- 전체 소스 탭에서만 `소스`를 표시하고 계좌/카드/대출 탭에서는 숨긴다.
- 전체 매칭상태 탭에서만 `매칭상태`를 표시하고 미반영 등 상태 탭에서는 숨긴다.
- Vitest 및 mock Playwright에서 양 조건을 검증했다.

### C6 — 목록 기능

- DataTable의 정렬·필터·선택·일괄조작 API를 변경하지 않았다.
- 열 정의만 교체하고 기존 PartnerAutocomplete, 개별 해제, 매핑 삭제, 선택 checkbox, Daily reverse mutation을 그대로 연결했다.
- Bank 일괄 입금보고서 및 권한 회귀 Playwright 14건이 통과했다.

## 3. 폭 실측

기획서 진단의 fix 전 실측:

```json
{"tableW":1654,"wrapperW":1276,"docW":1600}
```

fix 후 mock Playwright:

```text
[897 폭 실측] bank {"tableW":1276,"wrapperW":1278,"docW":1600,"scrollW":1276}
[897 폭 실측] daily {"tableW":1276,"wrapperW":1278,"docW":1600,"scrollW":1276}
```

fix 후 live QA:

```text
[897 라이브 폭 실측] bank {"tableW":1276,"wrapperW":1278,"docW":1600,"scrollW":1276}
[897 라이브 폭 실측] daily {"tableW":1276,"wrapperW":1278,"docW":1600,"scrollW":1276}
```

두 화면 모두 `tableW ≤ wrapperW`이고 문서 가로 scroll도 wrapper 폭을 넘지 않았다.

## 4. C2 값 대조

```text
Bank 상세: 국민 123-456
Bank 상세: 파일
Daily 상세: 2026/06/07-1
Daily 상세: 삼한거래처
```

mock QA에서 행의 원본 fixture 값과 상세 화면 값을 각각 대조했다. live QA에서도 실제 Bank 상세 값은 `입금`으로 읽혔고, Daily는 실제 데이터의 `상세 전표가 없습니다` 경로까지 확인했다.

## 5. 검증 원문

```text
clients/desktop
  npx vitest run
  Exit code: 0
  Test Files 168 passed (168)
  Tests 1350 passed (1350)

  npm run typecheck
  Exit code: 0

  npx vitest run src/renderer/routes/BankTransactionPage.test.tsx src/renderer/routes/DailyClosingPage.test.tsx
  Test Files 2 passed (2)
  Tests 23 passed (23)

  npx playwright test playwright/897-column-hierarchy/897-column-hierarchy.spec.ts --reporter=line
  3 passed

  npx playwright test playwright/bank-bulk-receipt/bank-bulk-receipt.spec.ts playwright/permission-groups-c5-followup/permission-groups-c5-followup.spec.ts --reporter=line
  14 passed

clients/web/design-system
  npx vitest run
  Test Files 23 passed (23)
  Tests 146 passed (146)

  npm run typecheck
  Exit code: 0

live QA, mock OFF, current worktree Vite :5263 + gateway :8080
  3 passed
  bank 1600px / daily 1600px / 375px action reachability
```

전체 Vitest에는 기존 JSDOM navigation 및 React Router future flag 경고가 있었지만 실패는 없었다.

## 6. 캡처

새 캡처는 모두 `resolveQaShotsDir()`를 통해 커밋 디렉터리의 `_local/`에 저장했다.

- [mock Bank 1600px](../../qa/897-column-hierarchy/_local/bank-1600.png)
- [mock Daily 1600px](../../qa/897-column-hierarchy/_local/daily-1600.png)
- [live Bank 1600px](../../qa/897-column-hierarchy/_local/bank-live-1600.png)
- [live Daily 1600px](../../qa/897-column-hierarchy/_local/daily-live-1600.png)

## 7. 변경 파일

- `clients/desktop/src/renderer/routes/BankTransactionPage.tsx`
- `clients/desktop/src/renderer/routes/BankTransactionPage.test.tsx`
- `clients/desktop/src/renderer/routes/DailyClosingPage.tsx`
- `clients/desktop/src/renderer/routes/DailyClosingPage.test.tsx`
- `clients/desktop/playwright/897-column-hierarchy/897-column-hierarchy.spec.ts`
- `clients/desktop/playwright/897-column-hierarchy-real-qa/897-column-hierarchy-real-qa.spec.ts`
- `clients/desktop/playwright/897-column-hierarchy-real-qa/playwright.config.ts`
- `clients/desktop/playwright/support/qa-screenshot-dir.ts`
- `.gitignore`
- `README.md`
- `ROADMAP.md`
- `migration/decisions/DECISIONS.md`
- `docs/samhan-public-overview.html`
- 본 보고서
- `docs/handoff/CURRENT-WORK.md`

## 8. 범위 밖 및 하지 못한 것

- 나머지 6개 메뉴는 수정하지 않았다.
- 사용자별 열 커스터마이즈와 #883 편입은 하지 않았다.
- 새 모달은 만들지 않았다.
- 대상 두 화면에 기존 별도 인쇄·엑셀 export surface가 없어 export 산출물 열 수 검증은 수행하지 못했다.
- 기존 Bank 상세 route가 저장소에 없어 native disclosure로 C2 경로를 제공했다.
- 이미 다른 worktree가 사용 중인 `http://127.0.0.1:5252`에는 연결하지 않고, 현재 worktree를 `:5263`으로 기동하여 gateway `:8080`과 함께 live QA했다.
- in-app Browser skill은 필수 `browser-client.mjs`가 설치 경로에 없어 사용할 수 없었고, 동일한 mock OFF 조건을 직접 Playwright로 검증했다.

## 9. 커밋 메시지 초안

```text
feat: #897 입출금·일마감 목록 열 계층화
```
