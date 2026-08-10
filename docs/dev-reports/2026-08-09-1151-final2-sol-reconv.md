# PR #1151 SOL 5.6 머지 전 최종 재수렴 2차

## 환경 확인

- 워크트리: `C:\dev\Samhan-Public\.claude\worktrees\t1142`
- 브랜치 / HEAD: `feat/1142-source-journal` / `8c5c2fd6d58fc13e39bbe2539fd0a58c678086d5`
- Chromium: Playwright bundled Chromium, headless, Desktop Chrome project
- Desktop 라우팅: HashRouter (`/#/...`) URL로만 진입
- strictPort 번들:
  - `5278`: `VITE_MOCK_MODE=0`, `VITE_API_BASE_URL=http://127.0.0.1:28082`
  - `5279`: `VITE_MOCK_MODE=1`, `VITE_API_BASE_URL=http://127.0.0.1:1`
  - `5280`: `VITE_MOCK_MODE=0`, `VITE_API_BASE_URL=http://127.0.0.1:8080`
- 호출 API(네트워크 원문으로 확인):
  - 격리 stack: `POST http://127.0.0.1:28082/auth/login`, `GET/POST http://127.0.0.1:28082/slips/**`, `GET http://127.0.0.1:28082/api/v1/slips/**/{realtime,collab/stream}`
  - 도메인 stack: `POST http://127.0.0.1:8080/auth/login`, `GET http://127.0.0.1:8080/api/v1/products/catalog-realtime`, `GET http://127.0.0.1:8080/admin/partners/list-realtime`
- 번들 HEAD 확인:

```text
git rev-parse HEAD
8c5c2fd6d58fc13e39bbe2539fd0a58c678086d5

GET http://127.0.0.1:5278/realtime/createRealtimeClient.ts -> 200
SOURCE newGuard=True oldGuard=False allowMock=True

[BUNDLE] GET http://127.0.0.1:5279/realtime/createRealtimeClient.ts -> 200 newGuard=true oldGuard=false
```

따라서 다른 worktree의 5273 재사용본이 아니라, 이 worktree HEAD의 새 가드
`isMockMode() && !config.allowMockMode`가 들어간 번들을 검증했다.

## 판정

**실 사용자 경로로 재현 가능한 이번 fix 잔존 결함: 0건. 머지 가능.**

`allowMockMode` 축은 맞게 그어졌다. mock에서 켜야 하는 transport는 fixture가 실제 SSE stream을
가로채는 공통 Yjs coedit factory 한 곳뿐이고, 나머지 일반 realtime/presence/collab event client는
mock에서 꺼져야 한다. 꺼져 있는데 실제로 켜야 하는 사용처는 찾지 못했다. 비mock에서는 협업·제품·거래처
SSE가 모두 실제 API `200 text/event-stream`으로 열렸다.

## 발화 조건 카운트

격리 stack의 입고 목록을 `GET /slips?slipType=INBOUND&status=...&page=0&size=100`으로 먼저 셌다.

```text
[TRIGGER COUNT] DRAFT      HTTP 200 count 9 total 9
[TRIGGER COUNT] SAVED      HTTP 200 count 4 total 4
[TRIGGER COUNT] SENT       HTTP 200 count 2 total 2
[TRIGGER COUNT] ACCEPTED   HTTP 200 count 6 total 6
[TRIGGER COUNT] PROCESSING HTTP 200 count 5 total 5
[TRIGGER COUNT] INSPECTING HTTP 200 count 7 total 7
[TRIGGER COUNT] COMPLETED  HTTP 200 count 20 total 20
```

기존 PROCESSING 5건은 현재 product-service에 없는 과거 product UUID만 참조했다. 첫 표본의
`POST /complete`는 `404 일부 제품을 찾을 수 없습니다 (요청 1, 응답 0)`였고 journal은 생성되지 않았다.
이는 격리 표본 불일치이므로 결함으로 세지 않았다. 현재 활성 제품과 거래처를 모두 가진 DRAFT
`2026/08/03-1`을 골라 GUI lifecycle 전체를 재발화했다.

## 각도 1 — source journal 라이브 재발화

대상 slip 내부 ID: `43f914c3-89fe-43d2-a748-8166e0713597` (화면에는 slipNo `2026/08/03-1`만 노출).

Playwright Chromium + 실제 Desktop 화면 원문:

```text
[LOGIN] POST http://127.0.0.1:28082/auth/login -> 200
[LIFECYCLE START] status=DRAFT remaining=save,send,accept,process
[LIFECYCLE] POST http://127.0.0.1:28082/slips/43f914c3-89fe-43d2-a748-8166e0713597/save -> 200
[LIFECYCLE] POST http://127.0.0.1:28082/slips/43f914c3-89fe-43d2-a748-8166e0713597/send -> 200
[LIFECYCLE] POST http://127.0.0.1:28082/slips/43f914c3-89fe-43d2-a748-8166e0713597/accept -> 200
[LIFECYCLE] POST http://127.0.0.1:28082/slips/43f914c3-89fe-43d2-a748-8166e0713597/process -> 200
[COMPLETE] POST http://127.0.0.1:28082/slips/43f914c3-89fe-43d2-a748-8166e0713597/complete -> 200
1 passed
```

완료 뒤 read-only journal 조회 원문:

```text
97794d15-5f1f-4130-8407-37c1b88f8645|0|APPLIED|AC060CN1DBC1|[]|[instance 1]
ad7a2698-bf45-479c-88f0-5c99b3995063|0|APPLIED|AC060CX1DBC1|[]|[instance 1]
7c7e10ac-b3fc-49f8-a47e-67471dda0e1e|0|APPLIED|PC1BWSK3NW|[]|[instance 1]
7bbe58b4-9daf-4d40-ae1a-a6baebae2fa6|0|APPLIED|AR-EC05|[]|[instance 1]
```

직접 DB INSERT/UPDATE/DELETE는 하지 않았다. journal 확인은 격리 Docker DB에 대한 read-only SELECT다.

스크린샷:

- `docs/qa/2026-08-09-1151-final2/06-before-source-journal-trigger.png`
- `docs/qa/2026-08-09-1151-final2/07-after-source-journal-trigger.png`

## 각도 2 — `allowMockMode` 전수 판정

### grep 원문

아래 명령의 raw 결과는 주석 예제 1줄을 포함해 23줄이며, 실행 가능한 production factory 호출은 22곳이다.

```text
rg -n --no-heading "createRealtimeClient\(\{" clients/desktop/src/renderer/realtime --glob '*.ts'

ArologisRealtimeClient.ts:21: ArologisDispatchRealtimeClient
createCoeditProvider.ts:147: createBasePathRealtimeClient return
AccountingRealtimeClient.ts:19: TaxInvoiceRealtimeClient
AccountingRealtimeClient.ts:24: ClosingRealtimeClient
AccountingRealtimeClient.ts:29: JournalRealtimeClient
createRealtimeClient.ts:12: 주석 예제
DcConfigRealtimeClient.ts:11: DcConfigRealtimeClient
createPresenceClient.ts:41: presence 공통 realtime
DispatchCollabRealtimeClient.ts:8: DispatchCollabRealtimeClient
DispatchTaskRealtimeClient.ts:18: DispatchTaskRealtimeClient
EstimateCollabRealtimeClient.ts:8: EstimateCollabRealtimeClient
EstimateListRealtimeClient.ts:8: EstimateListRealtimeClient
GroupwareApprovalCollabRealtimeClient.ts:6: GroupwareApprovalCollabRealtimeClient
JournalCollabRealtimeClient.ts:8: JournalCollabRealtimeClient
PartnerListRealtimeClient.ts:8: PartnerListRealtimeClient
PartnerOrderBoardRealtimeClient.ts:9: PartnerOrderBoardRealtimeClient
PartnerOrderCollabRealtimeClient.ts:8: PartnerOrderCollabRealtimeClient
PartnerOrderRealtimeClient.ts:15: PartnerOrderRealtimeClient
ProductRealtimeClient.ts:33: ProductRealtimeClient
SlipListRealtimeClient.ts:8: SlipListRealtimeClient
SlipCollabRealtimeClient.ts:8: SlipCollabRealtimeClient
WarehouseRealtimeClient.ts:20: InventoryAuditRealtimeClient
WarehouseRealtimeClient.ts:26: WarehouseRealtimeClient

rg -n --no-heading 'allowMockMode:\s*true' clients/desktop/src/renderer/realtime --glob '*.ts'
createCoeditProvider.ts:150: allowMockMode: true,
```

### 사용처별 mock 판정

| 그룹 | 실제 client | mock 판정 | 근거 |
|---|---|---:|---|
| Yjs 문서 coedit | `createBasePathRealtimeClient` (slip/journal/estimate/order/groupware 등 공통) | 켜짐 | Playwright가 `/collab/stream`을 직접 fulfill해야 원격 update/awareness가 들어옴 |
| 목록 realtime | Product, PartnerList, SlipList, EstimateList, PartnerOrderBoard, DispatchTask | 꺼짐 | mock adapter가 목록 fixture를 제공하며 raw fetch용 SSE server가 없음 |
| 회계/DC/창고 detail | TaxInvoice, Closing, Journal, DcConfig, InventoryAudit, Warehouse | 꺼짐 | mock 화면의 단일 세션 fixture; SSE fixture interception 없음 |
| 협업 domain event | Slip/Estimate/Journal/PartnerOrder/GroupwareApproval/Dispatch Collab | 꺼짐 | Yjs transport와 별개인 일반 event bus client; mock route가 이 client용 stream을 보장하지 않음 |
| Presence 공통 factory | Slip/Journal/PartnerOrder/Estimate/GroupwareApproval/Dispatch Presence | 꺼짐 | join/list는 mock Axios adapter, stream은 일반 raw SSE라 서버 없음 |
| 선언만 있고 현재 runtime caller 없음 | ArologisDispatch, JournalRealtime, PartnerOrderRealtime | 꺼짐 | import/use grep에서 자기 선언 외 0; 안전 기본값 유지 |
| 별도 legacy raw client | SlipRealtimeClient | 꺼짐 | 별도 `isMockMode()` guard 유지 |

실제 mock 화면은 제품, 거래처, 입출고 목록/상세, 견적 목록/상세, 주문 목록/상세, 회계 journal,
그룹웨어 결재, 세금계산서, 기간마감, DC 설정, 배차보드, 재고실사, 창고, 아로로지스 수동배차까지
17개 HashRouter 화면을 열었다.

```text
[MOCK CALLERS] screens=17 isolatedRequests=0 isolatedFailures=0
```

증거 무결성 주석: 재고실사 `audit-001`은 기존 mock detail fixture의 숫자 필드 누락으로
realtime subscribe 전에 `toLocaleString`에서 중단됐다. 실 API 사용자 경로 재현이 아니고 이 guard 변경과
무관하므로 결함으로 보고하지 않았다. 해당 화면을 포함해 격리 API 요청/실패 수는 0이었다.

스크린샷:

- `docs/qa/2026-08-09-1151-final2/04-mock-realtime-callers.png`

## 각도 3 — mock 탈출 재확인

정본 hardgate 직접 실행:

```text
npm exec -- playwright test playwright/1151-postmerge-mock-hardgate.spec.ts --config=playwright.config.ts --project=chromium --reporter=line
[MOCK HARDGATE] VITE_API_BASE_URL=http://127.0.0.1:1 isolatedFailures=0
1 passed (2.1s)
```

협업을 실제 여는 `coedit-s2a`:

```text
[CHECK-①] header.memo 원격 텍스트 병합: PASS
[CHECK-③-memo] 커서 배지 count=1 text="원격사용자A" — PASS
[CHECK-②] items.line-001.quantity 원격 값: "7"
[CHECK-③-qty] 커서 배지 count=1 text="원격사용자B" — PASS
2 passed (10.5s)
```

Playwright trace 네트워크 원문은 허용된 collaboration 요청만 보여 준다. 둘 다 브라우저가 실제 외부
socket으로 탈출한 것이 아니라 fixture가 fulfill했다.

```text
[TRACE] GET http://127.0.0.1:1/api/v1/slips/slip-005/collab/stream -> 200 fulfilled=True content-type=text/event-stream; charset=utf-8
[TRACE] GET http://127.0.0.1:1/api/v1/slips/slip-005/collab/stream -> 200 fulfilled=True content-type=text/event-stream; charset=utf-8
```

스크린샷:

- `docs/qa/2026-08-09-1151-final2/desktop-01-editmode.png`
- `docs/qa/2026-08-09-1151-final2/desktop-02-remote-fields.png`
- `docs/qa/2026-08-09-1151-final2/desktop-03-cell-clear.png`
- `docs/qa/2026-08-09-1151-final2/mobile-01.png`

## 각도 4 — 비mock 실 환경 SSE

Playwright Chromium에서 화면을 실제로 열어 관측한 원문:

```text
[LOGIN] POST http://127.0.0.1:8080/auth/login -> 200
[REAL SSE] GET http://127.0.0.1:8080/api/v1/products/catalog-realtime -> 200 content-type=text/event-stream
[REAL SSE] GET http://127.0.0.1:8080/admin/partners/list-realtime -> 200 content-type=text/event-stream
[LOGIN] POST http://127.0.0.1:28082/auth/login -> 200
[REAL SSE] GET http://127.0.0.1:28082/api/v1/slips/43f914c3-89fe-43d2-a748-8166e0713597/realtime -> 200 content-type=text/event-stream
[REAL SSE] GET http://127.0.0.1:28082/api/v1/slips/43f914c3-89fe-43d2-a748-8166e0713597/collab/stream -> 200 content-type=text/event-stream
1 passed (2.9s)
```

협업의 legacy detail stream과 collaboration stream 둘 다 실 API 200이며, 제품·거래처도 실 API 200이다.

스크린샷:

- `docs/qa/2026-08-09-1151-final2/05-real-sse-three-domains.png`

## 신규 파일 목록

이번 검증에서 생성:

- `clients/desktop/playwright/1151-final2-sol-reconv-real-qa.spec.ts` — `.gitignore`의
  `clients/desktop/playwright/*-real-qa.spec.ts` 규칙에 걸리는 로컬 live-QA harness
- `docs/dev-reports/2026-08-09-1151-final2-sol-reconv.md`
- `docs/qa/2026-08-09-1151-final2/04-mock-realtime-callers.png`
- `docs/qa/2026-08-09-1151-final2/05-real-sse-three-domains.png`
- `docs/qa/2026-08-09-1151-final2/06-before-source-journal-trigger.png`
- `docs/qa/2026-08-09-1151-final2/07-after-source-journal-trigger.png`
- `docs/qa/2026-08-09-1151-final2/desktop-01-editmode.png`
- `docs/qa/2026-08-09-1151-final2/desktop-02-remote-fields.png`
- `docs/qa/2026-08-09-1151-final2/desktop-03-cell-clear.png`
- `docs/qa/2026-08-09-1151-final2/mobile-01.png`

시작 전부터 있던 untracked `clients/web/design-system/vite.config.ts.timestamp-1786257219189-390b01a4d6d3c.mjs`와
`scratchpad/`는 수정하지 않았다. git commit/push는 하지 않았다.
