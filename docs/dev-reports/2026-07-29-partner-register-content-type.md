# 거래처 승인요청 Content-Type 결함 수정 보고

## 1. RED 원문

P0 서버 회귀 테스트의 기존 RED 원문은 다음과 같다.

```text
PartnerAuthExceptionHandlerHttpMessageTest > unsupportedContentType_returnsUnsupportedMediaType() FAILED
java.lang.AssertionError: Status expected:<415> but was:<500>
```

클라이언트 P0 테스트의 기존 RED 원문은 문자열 body가 전송된 상태를 확인했다.

```text
samhanApi.call > 승인요청 RPC 는 레거시 2번째 모바일 인자를 JSON body에 보존한다 FAILED
Received: ["/auth/partner-register", "1068689215"]
Expected: ["/auth/partner-register", { "bizNo": "1068689215", "mobile": true }]
```

위 P0 중간 테스트의 `mobile` 기대값은 서버 DTO 대조 후 제거했으며, 최종 테스트는 `{ bizNo }`만 기대한다.

이번 PM 보정 라운드에서는 서버 DTO에 없는 값을 보내지 않는 단정으로 테스트를 먼저 수정했다. 구현 수정 전 대상 테스트 RED 원문은 다음과 같다.

```text
> @samhan/order-app@0.4.0 test
> vitest run src/__tests__/samhanApi.test.ts

 RUN  v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t992/clients/web/order-app

 ❯ src/__tests__/samhanApi.test.ts (9 tests | 3 failed) 10ms
   × samhanApi.call > 승인요청 RPC 는 레거시 호출의 모바일 인자를 버리고 서버 DTO body를 보낸다
     → expected "spy" to be called with arguments: [ '/auth/partner-register', …(1) ]
     Received: { "bizNo": "1068689215", "mobile": true }
   × samhanApi.call > 주문 이력 RPC 는 서버가 읽는 사업자코드·시작일·종료일만 query로 보낸다
     → expected "spy" to be called with arguments: [ '/partner-orders/history', …(1) ]
     Received params: { "bizCode": "1234567890", "dateType": "주문일시", "from": "2026-07-01T00:00:00", "to": "2026-07-31T23:59:59" }
   × samhanApi.call > 프론트 로그 RPC 는 서버가 읽는 X-Biz-Code만 HTTP metadata로 보낸다
     → expected "spy" to be called with arguments: [ '/partner-orders/log', …(2) ]
     Received headers: { "X-Biz-Code": "1234567890", "X-Client-Mobile": "true" }

 Test Files 1 failed (1)
 Tests 3 failed | 6 passed (9)
```

전수 대조에서 잡은 3건의 기존 RED 핵심 원문도 보존한다.

```text
× samhanApi.call > 주문 이력 RPC 는 HTML 호출부의 날짜 유형·시작일·종료일을 모두 query로 보존한다
  → Received params contained "0": "주", "1": "문", "2": "일", "3": "시"

× samhanApi.call > 프론트 로그 RPC 는 레거시 사업자번호·모바일 인자를 HTTP metadata로 보존한다
  → Received: only path and action/detail body; expected X-Biz-Code header (중간 테스트는 X-Client-Mobile도 기대했으나 DTO 대조 후 제거)

× samhanApi.call > 튜토리얼 RPC 는 사업자번호·모바일 여부를 partner-auth 요청 계약으로 변환한다
  → Received: { "state": "1234567890" }
  Expected: { "bizNo": "1234567890", "platform": "MOBILE", "done": true }
```

## 2. 수정 내용과 선택 이유

서버 DTO와 컨트롤러가 실제로 읽는 필드만 전송하도록 RPC 핸들러를 정리했다.

- `requestAuthApproval`: `PartnerRegisterRequest`에 없는 `mobile`을 제거하고 `{ bizNo }` 객체 body를 전송한다. 레거시 호출의 두 번째 boolean은 서버가 읽지 않으므로 전송하지 않는다.
- `setAuthPassword`: `SetPasswordRequest`에 없는 `mobile`을 제거하고 `{ bizNo, newPassword }`만 전송한다.
- `tryLogin`: `TryLoginRequest`에 없는 `mobile`을 제거하고 `{ bizNo, password }`만 전송한다.
- `getOrderHistory`: `PartnerOrderHistoryController`에 없는 `dateType`을 제거하고 필수 `bizCode`, `from`, `to`만 query로 전송한다.
- `logFrontEvent`: 서버가 실제로 읽는 `X-Biz-Code`만 header로 전송하고, 읽는 근거가 없는 모바일 header는 제거한다.
- `getOrderSnapshotHistory`·`getDraftList`: `PartnerOrderDraftController`에 `bizNo` query가 없고 `X-Partner-Code`로 본인 거래처를 제한하므로 `bizNo`를 다시 query에서 제거한다.
- `saveTutorialState`: `TutorialUpdateRequest`의 `bizNo`, `platform`, `done`과 일치하므로 유지한다.
- `sendOrderFromUi`: 이 PR에서 해결하지 않고 기존 payload body 전달 형태로 원복했다. 상세 근거는 5절에 기록한다.

## 3. RPC 맵 전수 대조표

실제 `RPC_MAP` 객체의 핸들러는 **19개**다. `index.html`의 직접 호출부를 전수 확인했고, 호출 인자와 서버가 실제로 소비하는 값 및 body/query 형태를 대조했다.

| 핸들러 | `index.html` 호출부 | 호출 인자(개수·타입) | 핸들러 소비 / 전송 | 판정 |
|---|---|---|---|---|
| `checkAuthStatus` | 8114 | `val` 1개(string) | `bizNo` query | 정상 |
| `requestAuthApproval` | 8276 | `AUTH_BIZ` string + `isMobileNow()` boolean | 첫 인자만 소비, `{ bizNo }` JSON body | 정상(모바일 비전송; DTO에 없음) |
| `register` | 없음 | 직접 호출 없음 | `[payload]` object body | 정상(호출부 없음) |
| `setAuthPassword` | 8312 | `AUTH_BIZ` string + `p1` string + 모바일 boolean | 첫 두 인자만 소비, `{ bizNo, newPassword }` JSON body | 정상(모바일 비전송; DTO에 없음) |
| `tryLogin` | 8356 | `AUTH_BIZ` string + `pw` string + 모바일 boolean | 첫 두 인자만 소비, `{ bizNo, password }` JSON body | 정상(모바일 비전송; DTO에 없음) |
| `requestTempPassword` | 없음 | 직접 호출 없음 | `[bizNo]` JSON body | 정상(호출부 없음) |
| `getAccessExpiration` | 8434 | `window.CURRENT_BIZNO` 1개(string) | `bizNo` query | 정상 |
| `getGateImages` | 7808 | 0개 | 0개 | 정상 |
| `getOrderHistory` | 8667 | bizCode/type/from/to 4개(string) | `type`은 소비하지 않음, `bizCode`와 ISO `from/to`만 query | 정상(type/dateType 비전송; 서버 파라미터 없음) |
| `logFrontEvent` | 8776, 8790 | bizCode/action/detail string 3개 + 모바일 boolean | action/detail body와 `X-Biz-Code` header만 전송 | 정상(모바일 비전송; 서버가 읽지 않음) |
| `saveOrderSnapshot` | 9185 | snapshot 1개(object) | object body | 정상 |
| `saveDraft` | 없음 | 직접 호출 없음 | `[payload]` object body | 정상(호출부 없음) |
| `getOrderSnapshotHistory` | 9411 | bizNo/from/to 3개(string) | `from/to` query만 전송; 거래처 범위는 `X-Partner-Code` | 정상(`bizNo` 비전송; 서버 query 파라미터 없음) |
| `getDraftList` | 없음 | 직접 호출 없음 | `from/to` query; 거래처 범위는 `X-Partner-Code` | 정상(호출부 없음) |
| `sendOrderFromUi` | 6634 | items array + order object 2개 | 첫 번째 payload만 body로 전송하며 기존 형태 유지 | 결함 발견·범위 밖·미수정 |
| `saveTutorialState` | 9970 | bizNo string + 모바일 boolean 2개 | `{ bizNo, platform: PC\|MOBILE, done: true }` JSON body | 정상(DTO와 일치) |
| `getCustomerData` | 없음 | 직접 호출 없음 | `partnerCode` path | 정상(호출부 없음) |
| `getProducts` | 없음 | 직접 호출 없음 | `category` query | 정상(호출부 없음) |
| `applyConfigFromServer` | 없음 | index의 local 함수와 RPC 이름이 다름 | `_partnerCode`를 명시적으로 소비하고 sessionStorage 캐시 반환 | 정상(호출부 없음) |

추가로 확인한 **실제 DTO 불일치 결함은 3건**(`getOrderHistory`, `logFrontEvent`, `saveTutorialState`)이며 모두 유지·검증했다. P0 `requestAuthApproval`은 객체 body 수정은 유지하고, DTO에 없는 모바일 필드는 제거했다. `setAuthPassword`, `tryLogin`, `getOrderSnapshotHistory`의 모바일/dateType/bizNo 전송 변경은 근거가 없어 되돌렸다.

## 4. 검증

- 의존성: 워크트리에 `node_modules`가 없어 메인 트리 `C:\dev\Samhan-Public\clients\web\order-app\node_modules`를 junction으로 연결했다. `npm ci`·`npm install`은 실행하지 않았다.
- 새 테스트의 Ubuntu 불변성: 남긴 4개 회귀 테스트(`requestAuthApproval`, `getOrderHistory`, `logFrontEvent`, `saveTutorialState`)는 순수 RPC payload/HTTP 호출 인자 assertion이고 경로 구분자·대소문자·OS API에 의존하지 않으므로 `ubuntu-latest`에서도 참이다.
- partner-auth-service의 새 MockMvc 테스트 2개(`malformedJsonBody_returnsInvalidInput`, `unsupportedContentType_returnsUnsupportedMediaType`)도 URL 문자열과 MockMvc만 사용하므로 경로 구분자·대소문자·OS API에 의존하지 않아 `ubuntu-latest`에서도 참이다.

이번 라운드에서 남긴 테스트가 깨질 때 망가지는 사용자 경로는 다음과 같다.

| 테스트 | 단정이 깨질 때 망가지는 사용자 경로 |
|---|---|
| `승인요청 RPC 는 레거시 호출의 모바일 인자를 버리고 서버 DTO body를 보낸다` | 신규 거래처가 화면에서 `승인요청 보내기`를 눌러도 JSON body가 아닌 요청으로 바뀌어 가입 접수가 실패한다. |
| `주문 이력 RPC 는 서버가 읽는 사업자코드·시작일·종료일만 query로 보낸다` | 주문 이력 화면의 필수 기간 조회가 400으로 실패해 거래 이력을 볼 수 없다. |
| `프론트 로그 RPC 는 서버가 읽는 X-Biz-Code만 HTTP metadata로 보낸다` | 주문 전송·조회 중 프론트 감사 로그가 어느 거래처 이벤트인지 서버에 귀속되지 않는다. |
| `튜토리얼 RPC 는 사업자번호·모바일 여부를 partner-auth 요청 계약으로 변환한다` | 온보딩 튜토리얼 완료 상태가 저장되지 않아 다음 화면에서 튜토리얼이 반복된다. |
| `malformedJsonBody_returnsInvalidInput` | 로그인 JSON이 깨졌을 때 400 대신 내부 오류로 처리되어 잘못된 입력의 사용자 피드백 경로가 깨진다. |
| `unsupportedContentType_returnsUnsupportedMediaType` | 승인요청의 잘못된 Content-Type이 415가 아닌 500으로 노출되어 P0 장애가 재발한다. |
- `npm test -- src/__tests__/samhanApi.test.ts` 원문:

```text
> @samhan/order-app@0.4.0 test
> vitest run src/__tests__/samhanApi.test.ts

 RUN  v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t992/clients/web/order-app

 ✓ src/__tests__/samhanApi.test.ts (9 tests) 4ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
```

- `npm test` 원문:

```text
> @samhan/order-app@0.4.0 test
> vitest run

 ✓ src/__tests__/sanity.test.ts (2 tests) 1ms
 ✓ src/__tests__/commSetIndex.test.ts (1 test) 5ms
 ✓ src/__tests__/legacyConfigMapping.test.ts (2 tests) 8ms
 ✓ src/__tests__/bootstrapFailure.test.ts (2 tests) 13ms
 ✓ src/__tests__/legacyPreexistingFix.test.ts (2 tests) 12ms
 ✓ src/version/versionCheck.test.ts (5 tests) 4ms
 ✓ src/__tests__/priceChangeSchedule.test.ts (10 tests) 39ms
 ✓ src/version/versionGate.test.ts (2 tests) 3ms
 ✓ src/__tests__/samhanApi.test.ts (9 tests) 5ms
 ✓ src/__tests__/homeOptionAndZeroLockRestore.test.ts (10 tests) 49ms
 ✓ src/__tests__/sol2QuantityFix.test.ts (9 tests) 50ms
 ✓ src/__tests__/commercialManualSymmetry.test.ts (9 tests) 64ms
 ✓ src/__tests__/homeManualLockRestore.test.ts (16 tests) 90ms
 ✓ src/__tests__/commManualLockRestore.test.ts (24 tests) 139ms
 ✓ src/__tests__/legacy-quantity-golden.test.ts (73 tests) 344ms
 ✓ src/__tests__/priceParityS3.test.ts (7 tests) 416ms

 Test Files  16 passed (16)
      Tests  183 passed (183)
   Start at 19:39:24
   Duration 1.15s (transform 670ms, setup 0ms, collect 1.17s, tests 1.24s, environment 2ms, prepare 4.43s)
```

- `npm run typecheck` 원문:

```text
> @samhan/order-app@0.4.0 typecheck
> tsc -p tsconfig.json --noEmit
```

- `.\gradlew :services:partner-auth-service:test` 원문:

```text
> Task :services:partner-auth-service:processResources UP-TO-DATE
> Task :services:partner-auth-service:processTestResources NO-SOURCE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:security:jar UP-TO-DATE
> Task :services:partner-auth-service:compileJava UP-TO-DATE
> Task :services:partner-auth-service:classes UP-TO-DATE
> Task :services:partner-auth-service:compileTestJava
> Task :services:partner-auth-service:testClasses
> Task :services:partner-auth-service:test

BUILD SUCCESSFUL in 27s
9 actionable tasks: 2 executed, 7 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```
- Docker와 라이브 QA는 지시대로 실행하지 않았다.

## 5. 범위 밖에서 발견했으나 손대지 않은 것

`sendOrderFromUi`는 이 PR의 승인요청 Content-Type 범위 밖이며, PR #985가 같은 confirm 경로를 작업 중이므로 코드와 테스트를 이 PR에서 되돌렸다. 다음 실측 근거를 전달한다.

```js
// index.html:6574
const order = { bizno, managerName, addr, auditAddr, tel, due, payDue, memo, homeRate, commRate, isMobile };

// index.html:6634
.sendOrderFromUi(items, order);
```

현재 핸들러는 `order` 객체에서 `id`를 찾지만 해당 호출부의 `order.id`는 없다. 따라서 `id`가 `'new'`가 되고 `POST /api/v1/partner-orders/new/confirm`이 호출된다. 서버 매핑은 `@PathVariable UUID draftId`이므로 `'new'`는 UUID 바인딩에 실패한다. 또한 서버의 `ConfirmRequest`는 `@NotEmpty List<ConfirmLineRequest> lines` 하나만 가지므로 배송지·연락처·납기·메모 등 `order` 필드를 받을 수 없다. body 모양만 바꾸어서는 이 경로의 결함이 해소되지 않는다. 새 이슈는 등록하지 않았다.

## 6. 이 라운드에서 보지 않은 것

- `tools/legacy-gas/**`, `clients/desktop/**`는 검증·수정 범위에서 제외했다.
- `partner-auth-service` 외 `services/**`는 수정하지 않았다.
- Docker, 실서버/브라우저 라이브 QA, 운영 데이터 정합성, 승인 후 관리자 처리, SMS 발송, 모바일 앱의 별도 shim은 이번 라운드에서 보지 않았다.
