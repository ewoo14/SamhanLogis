# PR #1151 회귀 수정 — mock SSE guard와 협업 SSE 경계

## 결론

공통 `createRealtimeClient`의 mock no-op을 기본값으로 유지하고, `createCoeditProvider`가 만드는 협업 SSE client에만 `allowMockMode: true`를 명시했다. 협업 Playwright fixture가 `page.route`로 SSE를 제공할 때만 mock 협업 스트림이 재개되며, 제품·거래처·회계·아로로지스 등 일반 realtime client는 계속 no-op이다.

하드게이트에서 live 검증 스펙이 수집되지 않도록 다음 두 파일을 `playwright.config.ts`의 `testIgnore`에 추가했다. 파일은 삭제하지 않았다.

- `**/1151-final-reconv.spec.ts`
- `**/1151-postmerge-sol-reconv.spec.ts`

## 사용처 전수 목록

`createRealtimeClient` 직접 사용처는 다음과 같다.

- 협업/Presence: `createCoeditProvider.ts`, `createPresenceClient.ts`
- 회계: `AccountingRealtimeClient.ts` — `TaxInvoiceRealtimeClient`, `ClosingRealtimeClient`, `JournalRealtimeClient`
- 아로로지스: `ArologisRealtimeClient.ts` — `ArologisDispatchRealtimeClient`
- DC/창고: `DcConfigRealtimeClient.ts`, `WarehouseRealtimeClient.ts` — `InventoryAuditRealtimeClient`, `WarehouseRealtimeClient`
- 배차: `DispatchTaskRealtimeClient.ts`, `DispatchCollabRealtimeClient.ts`
- 견적: `EstimateListRealtimeClient.ts`, `EstimateCollabRealtimeClient.ts`
- 결재/그룹웨어: `GroupwareApprovalCollabRealtimeClient.ts`
- 거래처/주문: `PartnerListRealtimeClient.ts`, `PartnerOrderRealtimeClient.ts`, `PartnerOrderBoardRealtimeClient.ts`, `PartnerOrderCollabRealtimeClient.ts`
- 품목/전표: `ProductRealtimeClient.ts`, `SlipListRealtimeClient.ts`, `SlipCollabRealtimeClient.ts`

추가로 `createRealtimeClient.test.ts`와 테스트 mock import 사용처가 있다.

### mock 사용 분류

- mock에서 실제 stream fixture를 사용하는 기능: `createDocCoeditProvider` 경로. `slip-collab/coedit-s2a.shots.spec.ts`가 `/collab/stream`을 `page.route`로 가로채 원격 Yjs update/awareness를 주입한다.
- mock에서 의도적으로 SSE를 사용하지 않는 기능: 제품 카탈로그, 거래처 목록, 전표 상세의 일반 realtime 경로. `ProductCatalogPage`/관련 mock handler와 `1151-postmerge-mock-hardgate.spec.ts`가 이를 검증한다.
- 회계, 아로로지스 배차, DC/창고, 견적/주문/결재의 공통 factory client에는 `allowMockMode`를 설정하지 않았다. 따라서 이번 변경으로 mock network가 열리지 않는다.
- `SlipRealtimeClient`는 별도 구현이며 기존 mock guard를 유지한다.

## RED 원문

### RED-A — 수정 전 `coedit-s2a`

실행 위치: `C:\dev\Samhan-Public\.claude\worktrees\t1142\clients\desktop`

```text
Running 2 tests using 1 worker
[CHECK-①] header.memo 원격 텍스트 병합: PASS
[CHECK-③-memo] 커서 배지 count=0 text="" — 미표시(SSE 처리 지연 가능)
Error: expect(received).toBeGreaterThan(expected)
Expected: > 0
Received: 0
at .../coedit-s2a.shots.spec.ts:318:28
1 failed
1 passed
```

### RED-B — 수정 전 mock hardgate

```text
[MOCK HARDGATE] VITE_API_BASE_URL=http://127.0.0.1:1 isolatedFailures=0
1 passed
```

RED-B는 수정 전에도 통과했고, 수정 후에도 유지해야 하는 불변식으로 취급했다.

### RED-C — 수정 전 live spec 수집 문제

기존 mock config에서 `1151-final-reconv.spec.ts`는 대상에 포함됐고, 로컬에는 4개 테스트가 수집됐다. 당시 live 서버가 없어 다음과 같이 실패했다.

```text
4 failed
apiRequestContext.get: connect ECONNREFUSED 127.0.0.1:5277
page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5276
page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:5275
```

수정 후 mock config 목록:

```text
Listing tests:
Total: 0 tests in 0 files
```

`1151-postmerge-sol-reconv.spec.ts`도 기존에는 3개가 수집됐고 첫 테스트가 60초 timeout으로 실패했다. 따라서 이 파일도 같은 live 제외 목록에 넣었다. `1151-final-sol-real-qa`는 기본 mock config의 `**/*-real-qa/**`에 이미 걸려 제외된다.

### RED-D — 수정 전 실측

별도 Node HTTP 실측에서 인증 후 다음 두 endpoint가 모두 200이었다.

```text
[LOGIN] POST http://127.0.0.1:8080/auth/login -> 200
[REAL SSE] GET http://127.0.0.1:8080/api/v1/products/catalog-realtime -> 200 content-type=text/event-stream
[REAL SSE] GET http://127.0.0.1:8080/admin/partners/list-realtime -> 200 content-type=text/event-stream
```

## GREEN 원문

### Unit

```text
Test Files  7 passed (7)
Tests       44 passed (44)
```

### RED-A GREEN

```text
[CHECK-③-memo] 커서 배지 count=1 text="원격사용자A" — PASS
[CHECK-③-qty] 커서 배지 count=1 text="원격사용자B" — PASS
[CHECK-⑤-clear] 수량 clear 후 값: "0" — PASS (7로 복원 안 됨)
[CHECK-⑥] UUID 비노출: PASS
2 passed (11.9s)
```

### RED-B GREEN

```text
[MOCK HARDGATE] VITE_API_BASE_URL=http://127.0.0.1:1 isolatedFailures=0
1 passed (4.2s)
```

### RED-C GREEN

기본 mock config에서 `1151-final-reconv.spec.ts`와 `1151-postmerge-sol-reconv.spec.ts`는 `Total: 0 tests in 0 files`로 수집되지 않는다. live 검증 파일 자체는 보존했다.

## A와 B를 동시에 만족시킨 방법

`RealtimeClientConfig.allowMockMode?: boolean`을 추가하되 기본값을 `false`로 두었다.

- 기본 factory client: `isMockMode() && !config.allowMockMode`이면 controller만 반환한다. 실 SSE로 탈출하지 않는다.
- 협업 factory: `createBasePathRealtimeClient()`에서만 `allowMockMode: true`를 넘긴다. 협업 스펙의 `page.route`가 stream을 fulfill하므로 Yjs awareness가 동작한다.
- 비mock 경로의 조건은 바뀌지 않아 실제 fetch/SSE reconnect 동작을 그대로 유지한다.

새 unit test는 mock + `allowMockMode: true`에서 fetch가 시작되는 계약을 고정하고, 기존 mock no-op 및 비mock fetch 테스트도 함께 통과했다.

## RED-A~D 판정

- A: PASS — mock hardgate `isolatedFailures=0`.
- B: PASS — coedit S2a `2 passed`; 일반 client들은 opt-in하지 않아 no-op 유지.
- C: PASS — 실 제품·거래처 SSE 각각 HTTP 200, `text/event-stream`.
- D: 미완료 — 이 라운드에서 입고 완료 source journal의 새 실 표본 실행은 하지 않았다. 기존 제품 코드는 건드리지 않았고 live spec은 mock gate에서 제외만 했다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-09-1151-coedit-regression-fix.md`

기존 작업과 무관한 선행 untracked 항목 `clients/web/design-system/vite.config.ts.timestamp-1786257219189-390b01a4d6d3c.mjs`, `scratchpad/`는 변경·삭제하지 않았다.

## 작업 중 주의 기록

첫 RED-A 실행에서 작업 디렉터리를 잘못 지정해 main checkout에서 실행했다. 파일 변경은 없었고 결과는 무효로 폐기했다. 이후 모든 유효한 명령과 검증은 지정된 `t1142` 워크트리에서만 수행했다.

커밋·push는 하지 않았다.
