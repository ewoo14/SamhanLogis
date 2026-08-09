# PR #1151 mock SSE guard 흡수 fix 보고

작성일: 2026-08-09  
워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1142`  
브랜치/HEAD: `feat/1142-source-journal` / `e850f4cd7ed4d8e89ae515968baf69f6edeaaaf3`

## 결론

renderer의 raw SSE 진입점 두 곳에 `isMockMode()` 조기 가드를 넣었다. mock에서는 기존 호출자의 `abort()` cleanup 계약을 유지한 `AbortController`만 반환하고, 비mock에서는 기존 `fetch`·backoff·heartbeat·재접속 경로를 그대로 실행한다.

## 조사 및 전제 대조

처음 5273 포트의 기존 서버를 재사용한 실행은 GREEN이었다. 이는 새 격리 API base로 번들된 서버가 아니므로 RED 판정으로 사용하지 않았다.

```text
[MOCK HARDGATE] VITE_API_BASE_URL=http://127.0.0.1:1 isolatedFailures=0
1 passed (6.0s)
```

5273은 2026-08-09부터 살아 있던 이 워크트리의 Vite 프로세스였고, `reuseExistingServer`가 재사용했다. 별도 5274에서 `VITE_MOCK_MODE=1`, `VITE_API_BASE_URL=http://127.0.0.1:1`을 명시해 재현했다.

## RED-A — mock hard gate

수정 전, 격리 renderer에서의 원문:

```text
Running 1 test using 1 worker
[MOCK HARDGATE] VITE_API_BASE_URL=http://127.0.0.1:1 isolatedFailures=5
[MOCK ESCAPE] GET http://127.0.0.1:1/api/v1/slips/slip-003/realtime net::ERR_UNSAFE_PORT
[MOCK ESCAPE] GET http://127.0.0.1:1/api/v1/slips/slip-003/collab/stream net::ERR_UNSAFE_PORT
[MOCK ESCAPE] GET http://127.0.0.1:1/api/v1/slips/slip-003/collab/stream net::ERR_UNSAFE_PORT
[MOCK ESCAPE] GET http://127.0.0.1:1/api/v1/slips/slip-003/collab/stream net::ERR_UNSAFE_PORT
[MOCK ESCAPE] GET http://127.0.0.1:1/api/v1/slips/slip-003/collab/stream net::ERR_UNSAFE_PORT
1 failed
PLAYWRIGHT_EXIT_CODE=1
```

수정 후 동일 조건:

```text
Running 1 test using 1 worker
[MOCK HARDGATE] VITE_API_BASE_URL=http://127.0.0.1:1 isolatedFailures=0
1 passed (2.1s)
PLAYWRIGHT_EXIT_CODE=0
```

## RED-B — 비mock 실제 SSE 구독

`VITE_MOCK_MODE=0`, `VITE_API_BASE_URL=http://127.0.0.1:28082`로 별도 renderer를 기동하고 실제 gateway 전표 상세에 진입했다. 브라우저 네트워크 원문:

```text
LOGIN_STATUS 200
[REAL SSE] GET http://127.0.0.1:28082/api/v1/slips/38936dfd-2f4e-4c18-ae06-781af441837c/realtime -> 200
[REAL SSE] GET http://127.0.0.1:28082/api/v1/slips/38936dfd-2f4e-4c18-ae06-781af441837c/collab/stream -> 200
[REAL SSE] GET http://127.0.0.1:28082/api/v1/slips/38936dfd-2f4e-4c18-ae06-781af441837c/collab/stream -> 200
REAL_SSE_OBSERVED_COUNT 26
REALTIME_PLAYWRIGHT_EXIT_CODE=0
```

앞의 23건은 Vite module URL에 `realtime` 문자열이 포함된 개발 로더 요청이고, 위 3건이 실제 gateway SSE 요청이다. 전표 realtime 1건과 collab stream의 후속 요청이 실제 HTTP 200으로 관측됐다.

## RED-C — mock 상세·재고조회 모달

기존 spec의 입고전표 상세 2건을 동일 격리 renderer에서 실행했다.

```text
Running 2 tests using 1 worker
2 passed (3.6s)
PLAYWRIGHT_EXIT_CODE=0
```

## RED-D — PR 본래 경로

이번 변경 전 각도 1 실측에서 이미 확보한 원문이다. fix는 inventory/slip backend 및 입고 lifecycle 코드를 건드리지 않았다.

```text
Running 3 tests using 1 worker
POST http://127.0.0.1:28082/slips/38936dfd-2f4e-4c18-ae06-781af441837c/save -> 200
POST http://127.0.0.1:28082/slips/38936dfd-2f4e-4c18-ae06-781af441837c/send -> 200
POST http://127.0.0.1:28082/slips/38936dfd-2f4e-4c18-ae06-781af441837c/accept -> 200
POST http://127.0.0.1:28082/slips/38936dfd-2f4e-4c18-ae06-781af441837c/process -> 200
POST http://127.0.0.1:28082/slips/38936dfd-2f4e-4c18-ae06-781af441837c/complete -> 200
38936dfd-2f4e-4c18-ae06-781af441837c|0|APPLIED|["c44fb4d5-5c3b-4a10-a55e-20b34f9c49cc"]|[]
```

## 계열 sweep

축: `axios adapter를 거치지 않고 직접 fetch 또는 EventSource로 서버에 붙는 renderer 코드`  
대상: `clients/desktop/src/renderer`만. preload, main, script, Playwright harness는 제외했다.

실행한 grep 원문:

```text
rg -n --glob '*.{ts,tsx,js,jsx}' '(^|[^.[:alnum:]_])(fetch|EventSource)\s*\(' clients/desktop/src/renderer
clients/desktop/src/renderer\realtime\SlipRealtimeClient.ts:133:      const res = await fetch(url, {
clients/desktop/src/renderer\realtime\createRealtimeClient.ts:124:        const res = await fetch(url, {
```

목록은 위 두 파일뿐이다. `createRealtimeClient`는 slip collab, presence 및 각 도메인 SSE의 공통 factory이므로 한 가드로 계열 전체를 닫았다. `SlipRealtimeClient`는 별도 legacy 전표 realtime raw client라 별도 가드를 추가했다. `EventSource` 직접 사용은 0건이다.

## 상태 조합 sweep

| 모드 | 구독 성공 | 서버 실패 | 재접속 |
|---|---|---|---|
| mock | raw fetch 자체를 시작하지 않고 controller 반환 | 실 네트워크 없음 | reconnect timer 없음 |
| 비mock | 실제 `/realtime`·`/collab/stream` HTTP 200 | unit test에서 기존 503 실패 처리 확인 | 기존 backoff 코드를 유지하고 실제 collab 후속 요청 HTTP 200 관측 |

## 실행 명령 및 종료 코드

```text
npm exec -- vitest run src/renderer/realtime/createRealtimeClient.test.ts src/renderer/realtime/SlipRealtimeClient.test.ts
  수정 전 RED: exit 1 (mock 테스트 2건 실패)
  수정 후 GREEN: exit 0 (2 files, 4 tests)

npm exec -- playwright test playwright/1151-postmerge-mock-hardgate.spec.ts --config=playwright.config.ts
  격리 5274 renderer: exit 0, isolatedFailures=0

npm exec -- playwright test playwright/d2-6d-inventory-lookup/inventory-lookup.spec.ts --config=playwright.config.ts --grep '입고전표'
  exit 0, 2 passed

npm exec -- vitest run src/renderer/realtime/createRealtimeClient.test.ts src/renderer/realtime/SlipRealtimeClient.test.ts src/renderer/realtime/EstimateCollabRealtimeClient.test.ts src/renderer/realtime/createPresenceClient.estimate.test.ts src/renderer/realtime/createCoeditProvider.test.ts src/renderer/realtime/useCollectionRealtime.test.ts
  exit 0, 6 files / 40 tests

npm exec -- eslint src/renderer/realtime/SlipRealtimeClient.ts src/renderer/realtime/createRealtimeClient.ts src/renderer/realtime/SlipRealtimeClient.test.ts src/renderer/realtime/createRealtimeClient.test.ts
  exit 0

npm exec -- tsc -p tsconfig.web.json --noEmit
  exit 0

git diff --check
  exit 0
```

## 변경 파일

- `clients/desktop/src/renderer/realtime/SlipRealtimeClient.ts`
- `clients/desktop/src/renderer/realtime/createRealtimeClient.ts`
- `clients/desktop/src/renderer/realtime/SlipRealtimeClient.test.ts` — 신규
- `clients/desktop/src/renderer/realtime/createRealtimeClient.test.ts` — 신규
- `docs/dev-reports/2026-08-09-1151-mock-sse-guard-fix.md` — 신규

## 신규 생성 파일 목록

위 목록 중 `*.test.ts` 2개와 본 보고서 1개가 이번 라운드 신규 생성 파일이다. 기존 untracked `clients/web/design-system/vite.config.ts.timestamp-1786257219189-390b01a4d6d3c.mjs`, `scratchpad/`는 건드리지 않았다.

## 못 한 것

- RED-D의 GUI 입고 완료는 직전 postmerge 실측에서 이미 `complete -> 200`, journal `APPLIED`까지 확인된 상태이며, 이번 fix에서 해당 backend/lifecycle 경로를 변경하지 않아 같은 공유 표본으로 재발화하지 않았다.
- 새 QA screenshot은 추가하지 않았다. 기존 hardgate 실행이 갱신한 캡처는 기존 `docs/qa/1151-postmerge-sol-reconv/` 경로에 있으며 `_local` 산출물을 새로 만들지 않았다.
- git commit/push는 하지 않았다.
