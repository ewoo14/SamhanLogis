# PR #1248 CODEX LUNA 수정 보고서

## ① 결함별 RED 원문

선행 테스트 실행: `npx vitest run src/renderer/routes/SalesCommissionSettlementDetailPage.test.tsx`

```text
10 tests | 2 failed
느린 이전 계산 응답은 최신 입력 결과를 덮어쓰지 않는다
  Expected element value: 12 / Received: 1
정수 금액의 저장 왕복은 화면에 불필요한 .000000을 붙이지 않는다
  Unable to find element with text: ₩1,234,567
```

stale 재조회 주입을 추가한 RED에서는 다음이 확인됐다.

```text
입력 중 도착한 stale 재조회 → 입력값 2000000 이 서버 snapshot 1000000 으로 덮임
응답 역전 후 stale A snapshot → 최신 B 결과 12 가 이전 결과 1 로 되돌아감
```

## ② 고친 내용

- 입력/선택 변경 필드를 `editingFields`로 추적하고, 재조회 응답은 dirty 필드를 병합하지 않도록 수정했다.
- 최신 sequence 응답만 결과로 채택하고, 저장 응답을 query cache에 반영한 뒤 `refetchType: 'none'`으로 stale 재조회가 즉시 폼을 되돌리지 않게 했다. 다음 mount/focus 재조회는 계속 가능하다.
- 저장 응답과 입력 폼에서 금액의 의미 있는 소수만 유지하고, 0으로 채워진 소수부(`.000000`)는 제거했다.
- 제경비 토글도 입력 중 필드로 추적했다.

## ③ GREEN

```text
npx vitest run src/renderer/routes/SalesCommissionSettlementDetailPage.test.tsx
Test Files 1 passed
Tests 10 passed

npm run typecheck
Exit code 0

npm run lint
Exit code 0 (0 errors, 196 existing warnings)

npm run build
Exit code 0
```

전체 `npm test`는 기존 미추적 QA 스펙 `1248-merge-verdict-sol2-real-qa`의 하네스 위반 3건으로 실패했다. 이 실패는 새 코드가 아니라 기존 산출물의 직접 `shotsDir` 경로, 기존 0ms `setTimeout`, 기존 QA 잔재에 대한 것이다. 이 라운드에서 추가한 테스트의 0ms 타이머는 제거했다.

## ④ 라이브 캡처 before/after

Playwright Chromium `headless: true` 기동 및 캡처 성공. 캡처 DOM 행은 입력 5개로 확인했다.

- [01 before 입력/재조회 조건](./screenshots/01-before-input-requery-real-qa.png)
- [02 after 입력 보존](./screenshots/02-after-input-requery-real-qa.png)
- [03 after 응답 역전](./screenshots/03-after-response-inversion-real-qa.png)

기존 격리 실측 스펙은 다음 환경 오류로 실제 API 화면까지 진입하지 못했다.

```text
apiRequestContext.post: connect ECONNREFUSED 127.0.0.1:28637
```

실행 중 desktop 앱도 인증 부트스트랩에서 상세 route 진입이 되지 않아, Playwright route mock fallback으로 페이지 형태와 5행 입력 DOM을 캡처했다. 따라서 위 캡처는 실제 백엔드·공유 DB 검증 증거가 아니라 headless 화면 회귀 증거이며, 이 한계를 숨기지 않는다.

## ⑤ CI 실패 3건의 정체

- `Frontend Desktop`: 기존 `SalesCommissionSettlementDetailPage.test.tsx`의 0ms `setTimeout` 하네스 H-4 위반으로 1 failed / 2462 passed.
- `하네스 거짓 green 가드`: 같은 H-4 위반 및 기존 QA 스펙의 직접 `shotsDir` 경로 검출.
- `GitGuardian Security Checks`: 외부 check 실패. 로컬에서 재현 가능한 원문/비밀 탐지 판정은 확보하지 못했으며, 코드 변경 원인으로 단정할 근거가 없다.

## ⑥ 프로세스 회수

이번 라운드에서 시작한 Playwright browser는 정상 종료됐고 잔여 Chromium은 0개로 확인했다. 현재 남은 `node` 14개는 기존 공유 stack/Vite 프로세스라 건드리지 않았다.

```text
git add/commit/push: 실행하지 않음
공유 DB write: 실행하지 않음
QA1248 신규 컨테이너: 0
QA1248 신규 Vite/Node 프로세스: 0 (기존 공유 node 14개 유지)
```
