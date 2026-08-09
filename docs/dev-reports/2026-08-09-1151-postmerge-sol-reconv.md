# PR #1151 병합 후 SOL 5.6 적대검증 재수렴

## 환경 확인

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1142`
- 브랜치 / HEAD: `feat/1142-source-journal` / `02b9a8d863df2685f6adf7ee46fc208a52854005`
- Desktop: `http://127.0.0.1:5273`, PID `62080`, 이 워크트리에서 `vite src/renderer --config vite.config.ts` 실행
- 실제 사용자 API: Browser → `http://127.0.0.1:28082` → `sol1151final-liveqa-gateway` → 격리 auth/slip/inventory
- 직접 포트: auth `28181`, inventory `28185`, slip `28186`
- health: auth / inventory / slip / gateway 모두 `healthy`
- Playwright Chromium, `headless: true`, 관련 spec만 실행. DB 직접 INSERT 없음.

Desktop 핵심 파일은 워킹트리 blob과 HEAD blob이 일치했다.

```text
clients/desktop/src/renderer/api/mock.ts
  working=c777f1e60a02df30b055fe2c1ac7e3c1ed30f321
  HEAD   =c777f1e60a02df30b055fe2c1ac7e3c1ed30f321
clients/desktop/src/renderer/routes/SlipDetailPage.tsx
  working=7d2b377b2fa2ccfaff1bdff2a4dca6384878f668
  HEAD   =7d2b377b2fa2ccfaff1bdff2a4dca6384878f668
```

최초 확인 때 auth 배포 JAR에는 병합본 V98이 없었다. 그 상태에서는 판정하지 않고 HEAD에서 auth `bootJar`만 재생성해 격리 auth 컨테이너를 교체했다. 이후 V98 적용과 로컬/배포 SHA 일치를 확인했다. inventory/slip은 병합 델타가 없고 기존 로컬/배포 SHA가 이미 일치했다.

```text
V98|grant manager inbound inspection update|t

inventory local/deployed = 9d5013090be86ff8bb9231918e3b100b512a39f14ec87059f6fcd766637eecef
slip     local/deployed = d3d056b48eeacb8e3889a7ff61de38c6f0330117066d6bcfde14589dd4aef058
auth     local/deployed = 8984066abda90e03906a8265f993d612b2ac381715dfd340e0cc9cb325388ce1
```

## 판정

```text
실 사용자 경로 도달 결함: 1건
각도 1 입고 완료 → source journal: 통과
각도 2 MANAGER 허용 / SALES 차단: 통과
각도 3 Desktop mock 하드게이트: 실패
결론: 머지 보류
```

결함은 mock 모드 입고 상세에서 SSE 2종이 mock 경계를 탈출하는 것이다. `VITE_API_BASE_URL=http://127.0.0.1:1`에서 화면 진입과 mock 재고조회 모달은 동작하지만 `/realtime`과 `/collab/stream`이 실 `fetch`로 포트 1에 나가 hard gate가 red가 된다.

## 각도 1 — 입고 완료가 journal을 남기는가

### 발화 조건 카운트

검증 전 명목 상태 표본은 0이 아니었다.

```text
INBOUND|INSPECTING|4
INBOUND|PROCESSING|5
```

기존 PROCESSING 5건은 현재 product 정본에 없는 오래된 제품 UUID를 가리켜 GUI 완료 시 아래처럼 404가 났고 상태는 롤백됐다. 이 공유 잔재는 PR 결함으로 세지 않았다.

```text
POST /slips/579b147a-73f2-40c7-92c9-666529c35c1d/complete -> 404
{"success":false,"code":"NOT_FOUND","message":"일부 제품을 찾을 수 없습니다 (요청 1, 응답 0)"...}
```

DB를 고치지 않고 현재 product 정본에 존재하는 제품을 가진 DRAFT 2건을 Desktop GUI에서 `save → send → accept → process`로 발화 상태까지 올린 뒤 입고 완료를 눌렀다. 최종 fresh 실행 원문:

```text
Running 3 tests using 1 worker
POST http://127.0.0.1:28082/slips/38936dfd-2f4e-4c18-ae06-781af441837c/save -> 200
POST http://127.0.0.1:28082/slips/38936dfd-2f4e-4c18-ae06-781af441837c/send -> 200
POST http://127.0.0.1:28082/slips/38936dfd-2f4e-4c18-ae06-781af441837c/accept -> 200
POST http://127.0.0.1:28082/slips/38936dfd-2f4e-4c18-ae06-781af441837c/process -> 200
POST http://127.0.0.1:28082/slips/38936dfd-2f4e-4c18-ae06-781af441837c/complete -> 200
```

신규 journal과 실제 lot 연결:

```text
38936dfd-2f4e-4c18-ae06-781af441837c|0|APPLIED|["c44fb4d5-5c3b-4a10-a55e-20b34f9c49cc"]|[]
38936dfd-2f4e-4c18-ae06-781af441837c|c44fb4d5-5c3b-4a10-a55e-20b34f9c49cc|lot_exists=t|2026/08/08-10|quantity=1
```

전체 journal 무결성도 `total=8, null_slip_id=0, null_slip_revision=0, APPLIED=7`이었다.

스크린샷:

- [MASTER 입고 완료 전](../qa/1151-postmerge-sol-reconv/_local/01-master-before-inbound-complete.png)
- [MASTER 입고 완료 후](../qa/1151-postmerge-sol-reconv/_local/02-master-after-inbound-complete.png)

## 각도 2 — 권한 양방향

V98 canonical 템플릿과 계정 캐시는 다음과 같았다.

```text
MANAGER|inbound.inspection|view=t|create=f|update=t|delete=f|restore=f|download=f|print=f
SALES  |inbound.inspection|view=f|create=f|update=f|delete=f|restore=f|download=f|print=f
dev_manager|inbound.inspection|view=t|create=f|update=t|delete=f|restore=f|download=f|print=f
dev_sales  |inbound.inspection|view=f|create=f|update=f|delete=f|restore=f|download=f|print=f
```

MANAGER는 Desktop에서 동일한 전체 경로를 밟아 `/complete` 200으로 journal을 남기고, 이어 `/inspect` 200으로 `COMPLETED`까지 수렴했다.

```text
POST http://127.0.0.1:28082/slips/dd0456d0-50f9-4c76-8bbe-c9672a20356d/complete -> 200
POST http://127.0.0.1:28082/slips/dd0456d0-50f9-4c76-8bbe-c9672a20356d/inspect -> 200
dd0456d0-50f9-4c76-8bbe-c9672a20356d|2026/08/08-11|COMPLETED|revision=0|version=6
dd0456d0-50f9-4c76-8bbe-c9672a20356d|0|APPLIED|["25ff3a6e-0c06-44bf-aa92-e896838b4054"]|[]
dd0456d0-50f9-4c76-8bbe-c9672a20356d|25ff3a6e-0c06-44bf-aa92-e896838b4054|lot_exists=t|2026/08/08-11|quantity=1
```

SALES는 `inbound.inspection UPDATE`가 없고 동일 `/inspect`가 403이었다. 상세 URL 직접 진입도 대시보드로 전환되어 완료 버튼이 노출되지 않았다.

```text
[DENIED] SALES POST http://127.0.0.1:28082/slips/38936dfd-2f4e-4c18-ae06-781af441837c/inspect -> 403
3 passed (6.9s)
```

스크린샷:

- [MANAGER 입고 완료 전](../qa/1151-postmerge-sol-reconv/_local/03-manager-before-inbound-complete.png)
- [MANAGER 검수 완료 후 — 확정 버튼으로 수렴](../qa/1151-postmerge-sol-reconv/_local/04-manager-after-inspection-complete.png)
- [SALES 상세 진입 차단](../qa/1151-postmerge-sol-reconv/_local/05-sales-inspection-denied.png)

## 각도 3 — Desktop mock 하드게이트

먼저 병합으로 바뀐 권한 산출과 lifecycle 관련 Vitest 3개 파일을 격리 API 주소로 실행했다.

```text
VITE_MOCK_MODE=1
VITE_API_BASE_URL=http://127.0.0.1:1

Test Files  3 passed (3)
Tests       162 passed (162)
```

기존 입고 상세 mock UI 관련 Playwright 2건도 같은 격리 주소에서 통과했다.

```text
Running 2 tests using 1 worker
2 passed (6.1s)
```

그러나 이 두 spec은 SSE의 실 네트워크 탈출을 단언하지 않았다. 동일 입고 상세에서 실패 요청을 직접 수집하는 hard gate를 실행하자 red가 재현됐다.

```text
Running 1 test using 1 worker
[MOCK HARDGATE] VITE_API_BASE_URL=http://127.0.0.1:1 isolatedFailures=5
[MOCK ESCAPE] GET http://127.0.0.1:1/api/v1/slips/slip-003/realtime net::ERR_UNSAFE_PORT
[MOCK ESCAPE] GET http://127.0.0.1:1/api/v1/slips/slip-003/collab/stream net::ERR_UNSAFE_PORT
[MOCK ESCAPE] GET http://127.0.0.1:1/api/v1/slips/slip-003/collab/stream net::ERR_UNSAFE_PORT
[MOCK ESCAPE] GET http://127.0.0.1:1/api/v1/slips/slip-003/collab/stream net::ERR_UNSAFE_PORT
[MOCK ESCAPE] GET http://127.0.0.1:1/api/v1/slips/slip-003/collab/stream net::ERR_UNSAFE_PORT
1 failed
```

재현 경로:

1. `VITE_MOCK_MODE=1`, `VITE_API_BASE_URL=http://127.0.0.1:1`로 Desktop mock 서버 기동
2. MASTER로 `/#/purchases/slip-003?mockRole=MASTER` 진입
3. 전표 라인 선택 → `선택 품목 재고조회` → modal 정상 표시
4. 동시에 `SlipRealtimeClient.subscribe()`와 협업 realtime client가 mock 가드 없이 실 `fetch` 실행
5. realtime 1회와 재접속되는 collab stream이 포트 1로 탈출하여 spec red

코드 경계도 실측과 일치한다. `SlipDetailPage.tsx`는 mock 여부 확인 없이 `SlipRealtimeClient.subscribe()`를 호출하고, `SlipRealtimeClient.ts`와 `createRealtimeClient.ts`도 `isMockMode()` 가드 없이 `fetch`한다.

스크린샷:

- [격리 mock 입고 상세 — modal은 열리지만 SSE가 포트 1로 탈출](../qa/1151-postmerge-sol-reconv/_local/06-mock-hardgate-isolated-api.png)

## 신규 생성 파일

- `docs/dev-reports/2026-08-09-1151-postmerge-sol-reconv.md`
- `clients/desktop/playwright/1151-postmerge-sol-reconv.spec.ts`
- `clients/desktop/playwright/1151-postmerge-mock-hardgate.spec.ts`
- `docs/qa/1151-postmerge-sol-reconv/_local/01-master-before-inbound-complete.png`
- `docs/qa/1151-postmerge-sol-reconv/_local/02-master-after-inbound-complete.png`
- `docs/qa/1151-postmerge-sol-reconv/_local/03-manager-before-inbound-complete.png`
- `docs/qa/1151-postmerge-sol-reconv/_local/04-manager-after-inspection-complete.png`
- `docs/qa/1151-postmerge-sol-reconv/_local/05-sales-inspection-denied.png`
- `docs/qa/1151-postmerge-sol-reconv/_local/06-mock-hardgate-isolated-api.png`

git commit / push는 수행하지 않았다.
