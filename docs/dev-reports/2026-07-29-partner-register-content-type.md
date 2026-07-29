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

위 P0 중간 테스트의 `mobile` 기대값은 `PartnerRegisterRequest` 대조 후 제거했으며, 최종 테스트는 `{ bizNo }`만 기대한다. 이 결론은 `TryLoginRequest`에는 적용되지 않으며, 아래 8절의 PM 정정으로 대체한다.

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
- `tryLogin`: `TryLoginRequest`의 실제 `mobile` 필드를 포함해 `{ bizNo, password, mobile }`을 전송한다. 서버 감사 저장 코드가 `req.mobile()`을 소비하므로 레거시 세 번째 인자를 보존한다.
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
| `tryLogin` | 8356 | `AUTH_BIZ` string + `pw` string + 모바일 boolean | 세 인자를 소비, `{ bizNo, password, mobile }` JSON body | 정상(`TryLoginRequest.mobile` 및 감사 저장 코드가 존재) |
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

추가로 확인한 **실제 DTO 불일치 결함은 3건**(`getOrderHistory`, `logFrontEvent`, `saveTutorialState`)이며 모두 유지·검증했다. P0 `requestAuthApproval`은 객체 body 수정은 유지하고, DTO에 없는 모바일 필드는 제거했다. `setAuthPassword`의 모바일 전송은 근거가 없어 제거했고, `tryLogin`의 모바일 전송은 서버 DTO와 감사 코드 근거가 확인되어 복원했다. `getOrderSnapshotHistory`의 bizNo 전송과 history의 dateType 전송은 근거가 없어 보내지 않는다.

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

## 7. 라이브QA 후속 — 화면 응답 계약 보정

### 7.1 RED 원문

`index.html` inline success callback을 실제로 추출해 실행하는 테스트를 먼저 추가했다. 수정 전 RED 원문은 다음과 같다.

```text
> @samhan/order-app@0.4.0 test
> vitest run src/__tests__/legacyResponseContract.test.ts

 RUN  v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t992/clients/web/order-app

 ❯ src/__tests__/legacyResponseContract.test.ts (7 tests | 7 failed) 13ms
   × 승인요청 PENDING 응답은 접수 완료 모달을 표시한다
     → expected "spy" to be called with arguments: [ { icon: '✅', title: '완료', …(2) } ]
     Number of calls: 0
   × 승인요청 실패 응답은 서버 message를 사용자에게 보여준다
     → Received: [ undefined ]
   × 인증 상태의 알 수 없는 상태는 서버 message를 사용자에게 보여준다
     → Received: [ "알 수 없는 오류" ]
   × 비밀번호 설정 성공 응답은 서버 result를 기준으로 로그인 완료 처리한다
     → expected "spy" to be called at least once
   × 로그인 실패 응답은 서버가 반환한 message를 사용자에게 보여준다
     → Number of calls: 0
   × 사용기한 응답은 서버 expiresAt를 화면에 표시한다
     → Expected: "block"; Received: "none"
   × 튜토리얼 성공 응답은 서버 DTO를 성공으로 처리하고 undefined 오류를 표시하지 않는다
     → Received: "튜토리얼 기록 오류: undefined"

 Test Files 1 failed (1)
 Tests 7 failed (7)
```

### 7.2 `withSuccessHandler` 응답 필드 전수 대조

이번 표의 대상은 `index.html`에서 success callback이 응답 객체의 필드·값을 직접 판독하는 계열이다. `getOrderHistory`/`getOrderSnapshotHistory`의 배열·페이지 렌더링 shape과 `getGateImages` 원소 변환은 별도의 legacy 데이터 shape 계열이며 이 보정의 status/message 판독 대상은 아니다.

| 핸들러 / 위치 | 클라이언트가 읽는 필드·값 | 서버 DTO 실제 필드·값 | 판정 |
|---|---|---|---|
| `checkAuthStatus` → `onAuthStatus` / 8112, 8118 | `status`의 `NOT_FOUND_SYSTEM`, `NOT_FOUND_AUTH`, `PENDING`, `LOCKED`, `LONG_UNUSED`, `ACCESS_DENIED`, `PW_EXPIRED`, `NEED_PW_SET`, `NEED_PW_INPUT`; 오류 `message` | `CheckAuthStatusResponse.bizNo`, `status` 동일 enum, `partnerName`, `message` | 정상(오류 필드 수정) |
| `requestAuthApproval` / 8268 | 성공 `status=PENDING`; 실패 `message` | `PartnerRegisterResponse.bizNo`, `status=PENDING`, `message` | 정상(수정) |
| `setAuthPassword` / 8291 | 성공 `result=OK`; 중복 `result=USED_PW`; 실패 `message` | `SetPasswordResponse.result=OK\|USED_PW`, `message` | 정상(수정) |
| `tryLogin` / 8322 및 `completeLogin` | `status=OK\|LOCKED\|LONG_UNUSED\|ACCESS_DENIED`, `config`; 실패 `message`; config의 `partnerName`, `managerName` | `TryLoginResponse.status`, `token`, `config`, `message`; `PartnerConfigDto.partnerName`, `managerName` | 정상(수정; 존재하지 않는 `WRONG_PW/count/tutMo/tutPc/custName/repName` 제거) |
| `getAccessExpiration` / 8424 | `expiresAt` | `ExpirationResponse.bizNo`, `expiresAt`, `expiredAlready`, `remainingDays` | 정상(수정; `status/expireDate` 제거) |
| `saveTutorialState` / 9968 | `bizNo`, `tutorialPcDone`, `tutorialMobileDone`의 DTO 유효성 | `TutorialUpdateResponse.bizNo`, `tutorialPcDone`, `tutorialMobileDone` | 정상(수정; `success/error` 제거) |
| `sendOrderFromUi` / 6612 | shim이 만든 `ok`, `error` | 서버 `ConfirmResponse.orderNo`, `slipNo`, `status`, `slipPublishStatus`, `totalAmount`, `confirmedAt`; shim이 envelope success를 `ok`로 변환 | 정상(기존 어댑터; confirm 요청 자체는 5절 범위 밖) |
| `getGateImages` / 7808 | success callback은 응답 필드를 직접 판독하지 않고 원소를 legacy 이미지 source로 전달 | `GateImageResponse.label`, `s3Key`, `base64`, `displayOrder`, `mimeType` | status/message 계열 아님 |
| `getOrderHistory` / 8664 | success callback은 `renderHistory`로 배열을 전달 | `Page<HistoryResponse>`의 `content`와 `HistoryResponse.orderNo`, `slipNo`, `status`, `slipPublishStatus`, `totalAmount`, `confirmedAt` | status/message 계열 아님 |
| `saveOrderSnapshot` / 9173 | 성공 callback은 응답 필드를 읽지 않음 | `DraftResponse.draftId`, `draftSeq`, `label`, `expiresAt`, `createdAt` | 정상(필드 판독 없음) |
| `getOrderSnapshotHistory` / 9394 | success callback은 `data`를 legacy renderer로 전달 | `Page<DraftResponse>`의 `content`와 `draftId`, `draftSeq`, `label`, `expiresAt`, `createdAt` | status/message 계열 아님 |

### 7.3 변경 줄

- `index.html:8207`: `res.msg` → `res.message`.
- `index.html:8270~8274`: 승인 성공 기준 `OK` → 서버 실제 `PENDING`, 오류 `message`와 fallback 표시.
- `index.html:8294~8309`: 비밀번호 응답 기준 `status/msg` → `result/message`.
- `index.html:8324~8352`: 서버에 없는 `WRONG_PW/count` 제거, `status/message` 기반 실패 표시.
- `index.html:8375~8378`, `8443~8445`: 서버가 실제 반환하는 config와 명시적 기본값만 사용.
- `index.html:8425~8431`: `status/expireDate` → `expiresAt`.
- `index.html:9968~9973`: `success/error` → `TutorialUpdateResponse` 필드 검증.

### 7.4 후속 검증 원문

```text
> @samhan/order-app@0.4.0 test
> vitest run src/__tests__/legacyResponseContract.test.ts

 ✓ src/__tests__/legacyResponseContract.test.ts (7 tests) 4ms
 Test Files 1 passed (1)
      Tests 7 passed (7)

> @samhan/order-app@0.4.0 test
> vitest run

 Test Files 17 passed (17)
      Tests 190 passed (190)

> @samhan/order-app@0.4.0 typecheck
> tsc -p tsconfig.json --noEmit

> Task :services:partner-auth-service:test
BUILD SUCCESSFUL in 2s
9 actionable tasks: 9 up-to-date
```

신규 테스트 파일은 `clients/web/order-app/src/__tests__/legacyResponseContract.test.ts` 하나이며, raw import와 순수 callback 실행만 사용해 `ubuntu-latest`에서도 경로 구분자·대소문자·OS API 차이 없이 성립한다.

## 8. PM 정정 — `tryLogin.mobile` 복원

### 8.1 RED-first 원문

서버 DTO 전문을 다시 확인한 뒤, 레거시 세 번째 인자를 기대하도록 `samhanApi.test.ts`를 먼저 수정했다. 구현 복원 전 RED 원문은 다음과 같다.

```text
> @samhan/order-app@0.4.0 test
> vitest run src/__tests__/samhanApi.test.ts

 RUN v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t992/clients/web/order-app

 ❯ src/__tests__/samhanApi.test.ts (9 tests | 1 failed)
   × samhanApi.call > 로그인 RPC 는 envelope 언랩 후 token 과 config 를 캐싱한다
     Received:
       "/auth/partner-login",
       Object {
         "bizNo": "1234567890",
         "password": "1234",
       }
     Expected:
       "/auth/partner-login",
       Object {
         "bizNo": "1234567890",
         "mobile": true,
         "password": "1234",
       }

 Tests 1 failed | 8 passed (9)
```

### 8.2 복원

- 호출부: `clients/web/order-app/index.html:8356` — `.tryLogin(AUTH_BIZ, pw, isMobileNow())`, 3개 인자(string, string, boolean).
- 복원 줄: `clients/web/order-app/src/samhanApi.ts:128-135` — `([bizNo, pw, mobile])`을 destructure하고 JSON body에 `mobile`을 포함.
- 테스트 보강: `clients/web/order-app/src/__tests__/samhanApi.test.ts`의 로그인 RPC가 `mobile: true`를 기대한다.
- Ubuntu 불변성: 이 테스트는 Vitest mock과 JSON payload assertion만 사용하고 경로 구분자·대소문자·OS API에 의존하지 않으므로 `ubuntu-latest`에서도 참이다.

### 8.3 이 PR에서 손댄 RPC의 서버 필드 전수 대조

인증 요청 DTO는 다음 파일을 전문으로 열어 필드를 확인했다: `PartnerRegisterRequest.java`, `SetPasswordRequest.java`, `TryLoginRequest.java`, `TutorialUpdateRequest.java`. 주문 요청 계약도 `ConfirmRequest.java`, `ConfirmLineRequest.java`, `FrontEventLogRequest.java`를 전문으로 확인했다. GET query 엔드포인트는 요청 DTO가 없으므로 컨트롤러 파라미터와 서비스 소비 위치를 대조했다.

| RPC / 실제 호출부 | 클라이언트가 보내는 값 | 서버 DTO 또는 파라미터 전문 | 서버가 실제로 읽는 코드 위치 | 판정 |
|---|---|---|---|---|
| `requestAuthApproval` / `index.html:8276` | `bizNo: string`; 레거시 `mobile: boolean`은 보내지 않음 | `PartnerRegisterRequest.java:8-12` = `bizNo`, `partnerCode`, `memo` | `PartnerAuthController.java:51-56` → `PartnerAuthService.java:135`의 `req.bizNo()`, `:141`의 `req.memo()`; `partnerCode`는 `:140`에서 서버가 사업자번호로 산출 | 정상. DTO에 없는 `mobile`은 미전송 |
| `setAuthPassword` / `index.html:8312` | `bizNo: string`, `newPassword: string`; 레거시 `mobile: boolean`은 보내지 않음 | `SetPasswordRequest.java:7-15` = `bizNo`, `newPassword`, 선택 `currentPassword` | `PartnerAuthService.java:149`, `:158`, `:162`, `:170`, `:177`, `:181`, `:186`에서 `bizNo`, `currentPassword`, `newPassword` 소비 | 정상. `mobile`은 DTO에 없음 |
| `tryLogin` / `index.html:8356` | `bizNo: string`, `password: string`, `mobile: boolean` | `TryLoginRequest.java:7-12` = `bizNo`, `password`, `mobile` | `PartnerAuthService.java:195-252`; 특히 `PartnerLoginAttempt.of(..., req.mobile())`가 `:198`, `:212`, `:217`, `:222`, `:227`, `:241`, `:252`에 존재하고 `req.bizNo()`/`req.password()`도 같은 로그인 분기에서 소비 | 정상. 모바일 값이 실제 로그인 시도 감사 기록에 반영됨 |
| `getOrderHistory` / `index.html:8669` | `bizCode: string`, `from: ISO datetime`, `to: ISO datetime`; legacy `type`은 미전송 | 요청 DTO 없음. `PartnerOrderHistoryController.java:41-49` 파라미터 = `bizCode`, `from`, `to`, `page`, `size`, `X-Partner-Code` | `PartnerOrderHistoryController.java:49` → `PartnerOrderHistoryService.java:55-75`에서 `bizCode`, `from`, `to`, partner scope를 검증·repository 조회에 사용 | 정상. 서버 파라미터가 없는 `dateType/type`은 미전송 |
| `logFrontEvent` / `index.html:8778,8792` | `action: string`, `detail: string`, `X-Biz-Code`; legacy mobile은 미전송 | `FrontEventLogRequest.java:11-13` = `action`, `detail` | `FrontEventLogController.java:39-48`에서 `request.action()`, `request.detail()`, `X-Biz-Code`를 읽어 `FrontEventLog.of(partnerCode, bizCode, ...)`에 저장 | 정상. 서버가 읽지 않는 모바일 header는 미전송 |
| `getOrderSnapshotHistory`·`getDraftList` / `index.html:9413` | `from: ISO date`, `to: ISO date`; 호출부의 `bizNo`는 미전송 | 요청 DTO 없음. `PartnerOrderDraftController.java:64-77` 파라미터 = `page`, `size`, `from`, `to`, `X-Partner-Code` | `PartnerOrderDraftController.java:77` → `PartnerOrderDraftService.java:88-105`에서 `partnerCode`, `from`, `to`로 본인 거래처 조회 | 정상. `bizNo` query는 서버 파라미터가 아니며 거래처 범위는 `X-Partner-Code` |
| `saveTutorialState` / `index.html:9976` | `bizNo: string`, `platform: PC\|MOBILE`, `done: true` | `TutorialUpdateRequest.java:12-16` = `bizNo`, `platform`, `done` | `PartnerAuthController.java:92-95` → `PartnerAuthService.java:380-387`에서 `req.bizNo()`, `req.done()`, `req.platform()`을 읽어 PC/MOBILE 완료 상태 변경 | 정상 |
| `sendOrderFromUi` / `index.html:6634` | `items` array와 `order` object를 호출하지만 handler는 첫 payload만 body로 전달 | `ConfirmRequest.java:13` = `lines`만; 각 line은 `ConfirmLineRequest.java:14-18` = `productId`, `categoryKey`, `quantity`, `remark`; path는 UUID `draftId` | `PartnerOrderConfirmController.java:80-90`에서 UUID path와 `ConfirmRequest`를 읽음 | 기존 결함 발견·범위 밖·미수정. `order.id`가 없어 `new` path가 되며 PR #985 범위 |

`sendOrderFromUi`는 위 표에 실측 근거만 남겼고 body/path를 변경하지 않았다. `saveOrderSnapshot`/`saveDraft`는 이번 정정에서 손댄 RPC가 아니며 기존 M4 계약의 별도 범위로 확대하지 않았다.

이번 정정에서 새로 드러난 사항은 하나다. 이전 보고의 `TryLoginRequest` 필드 확인이 잘려 `mobile`을 누락했지만, DTO 전문에는 `boolean mobile`이 있고 `PartnerAuthService`가 실패·성공을 포함한 감사 저장 분기에서 이를 소비한다. 따라서 `tryLogin`만 모바일 값을 복원했다. `PartnerRegisterRequest`와 `SetPasswordRequest` 전문에는 `mobile`이 없으므로 두 요청은 되돌리지 않았다.

### 8.4 정정 후 검증 원문

`npx vitest run` 전체:

```text
 RUN v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t992/clients/web/order-app

 ✓ src/__tests__/sanity.test.ts (2 tests)
 ✓ src/__tests__/legacyConfigMapping.test.ts (2 tests)
 ✓ src/__tests__/legacyPreexistingFix.test.ts (2 tests)
 ✓ src/__tests__/commSetIndex.test.ts (1 test)
 ✓ src/__tests__/bootstrapFailure.test.ts (2 tests)
 ✓ src/__tests__/legacyResponseContract.test.ts (7 tests)
 ✓ src/__tests__/priceChangeSchedule.test.ts (10 tests)
 ✓ src/__tests__/sol2QuantityFix.test.ts (9 tests)
 ✓ src/__tests__/commercialManualSymmetry.test.ts (9 tests)
 ✓ src/version/versionGate.test.ts (2 tests)
 ✓ src/__tests__/homeOptionAndZeroLockRestore.test.ts (10 tests)
 ✓ src/version/versionCheck.test.ts (5 tests)
 ✓ src/__tests__/samhanApi.test.ts (9 tests)
 ✓ src/__tests__/homeManualLockRestore.test.ts (16 tests)
 ✓ src/__tests__/commManualLockRestore.test.ts (24 tests)
 ✓ src/__tests__/legacy-quantity-golden.test.ts (73 tests)
 ✓ src/__tests__/priceParityS3.test.ts (7 tests)

 Test Files 17 passed (17)
      Tests 190 passed (190)
   Start at 20:22:19
   Duration 1.35s (transform 659ms, setup 0ms, collect 1.82s, tests 1.22s, environment 2ms, prepare 6.85s)
```

`npm run typecheck`:

```text
> @samhan/order-app@0.4.0 typecheck
> tsc -p tsconfig.json --noEmit
```

`./gradlew :services:partner-auth-service:test --rerun-tasks --no-build-cache`:

```text
> Task :services:partner-auth-service:processResources
> Task :services:partner-auth-service:processTestResources NO-SOURCE
> Task :shared:security:compileJava
> Task :shared:security:processResources
> Task :shared:security:classes
> Task :shared:security:jar
> Task :shared:common:compileJava
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes
> Task :shared:common:jar
> Task :services:partner-auth-service:compileJava
> Task :services:partner-auth-service:classes
> Task :services:partner-auth-service:compileTestJava
> Task :services:partner-auth-service:testClasses
> Task :services:partner-auth-service:test

BUILD SUCCESSFUL in 32s
9 actionable tasks: 9 executed
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

`node_modules`는 기존과 같이 메인 트리 `C:\dev\Samhan-Public\clients\web\order-app\node_modules`를 junction으로 연결한 상태를 사용했고, 이번에도 `npm ci`/`npm install`은 실행하지 않았다. 이번 정정으로 변경한 파일은 `clients/web/order-app/src/samhanApi.ts`, `clients/web/order-app/src/__tests__/samhanApi.test.ts`, 본 보고서이며 신규 파일은 없다.

## 9. 적대검증 후속 — RPC 실패 핸들러 전수 보강

### 9.1 RED-first 원문

승인요청 중복 409와 동일한 실패 경로를 비밀번호 설정·로그인에도 적용해 실패 테스트를 먼저 추가했다. 수정 전 원문은 다음과 같다.

```text
 RUN v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t992/clients/web/order-app

 ❯ src/__tests__/legacyResponseContract.test.ts (10 tests | 3 failed)
   × 승인요청 HTTP 409는 서버 message를 보여주고 로딩을 해제한다
     → expected "spy" to be called with arguments: [ false ]
       Number of calls: 0
   × 비밀번호 설정 HTTP 실패는 서버 message를 보여주고 로딩을 해제한다
     → expected "spy" to be called with arguments: [ false ]
       Number of calls: 0
   × 로그인 HTTP 실패는 서버 message를 보여주고 로딩을 해제한다
     → expected "spy" to be called with arguments: [ false ]
       Number of calls: 0

 Test Files 1 failed (1)
      Tests 3 failed | 7 passed (10)
```

### 9.2 `withFailureHandler` 누락 전수 대조

`index.html`의 `google.script.run` 호출부 13개를 모두 확인했다. `showLoadingGate(true)`를 켜는 호출부는 4개이며 모두 실패 시 게이트를 해제한다. 게이트를 켜지 않는 백그라운드·best-effort 호출은 실패해도 화면이 멈추지 않으므로 별도 판정했다.

| 호출부 위치 / RPC | 로딩게이트 | 실패 시 거동 | 판정 |
|---|---|---|---|
| `6611` / `sendOrderFromUi` | `dlgProgress` 표시 | `withFailureHandler`가 경고와 닫기 버튼을 표시 | 정상 |
| `7808` / `getGateImages` | 없음 | 선택적 게이트 이미지가 비어 있고 이미지 모달만 열리지 않음; 화면 진행은 계속됨 | 정상(백그라운드 prefetch) |
| `8111` / `checkAuthStatus` | `showLoadingGate(true)` | `8113`에서 false 후 오류 표시 | 정상 |
| `8277` / `requestAuthApproval` | `showLoadingGate(true)` | 새 failure handler가 false 후 Axios `response.data.message` 표시 | 수정 |
| `8304` / `setAuthPassword` | `showLoadingGate(true)` | 새 failure handler가 false 후 서버 message 표시 | 수정 |
| `8339` / `tryLogin` | `showLoadingGate(true, ...)` | 새 failure handler가 false 후 서버 message 표시, 입력 초기화·focus | 수정 |
| `8448` / `getAccessExpiration` | 없음 | 백그라운드 갱신 실패 시 기존 만료 표시 유지; 화면 정지 없음 | 정상(백그라운드 polling) |
| `8687` / `getOrderHistory` | `#historyLoading` | `withFailureHandler`에서 로딩 숨김 및 조회 실패 표시 | 정상 |
| `8802` / `logFrontEvent` (`logActionToNotion`) | 없음 | best-effort 로그 실패를 console 경고로만 처리; 사용자 화면 정지 없음 | 정상(의도적 silent log) |
| `8814` / `logFrontEvent` (`sendLog`) | 없음 | `withFailureHandler`가 console 기록 | 정상 |
| `9196` / `saveOrderSnapshot` | 저장 버튼 상태 | `withFailureHandler`가 실패 표시 후 버튼 복구 | 정상 |
| `9417` / `getOrderSnapshotHistory` | 목록 placeholder | `withFailureHandler`가 오류 행 표시 | 정상 |
| `9991` / `saveTutorialState` | 없음 | `withFailureHandler`가 통신 오류 표시 | 정상 |

### 9.3 변경 줄

- `index.html:8211-8218`: Axios 오류의 `response.data.message`를 우선 추출하는 `getRpcFailureMessage` 추가.
- `index.html:8286-8289`: 승인요청 실패 시 로딩 해제 및 서버 `message` 표시.
- `index.html:8326-8329`: 비밀번호 설정 실패 시 로딩 해제 및 서버 `message` 표시.
- `index.html:8374-8379`: 로그인 실패 시 로딩 해제, 서버 `message` 표시, 비밀번호 입력 초기화.
- `legacyResponseContract.test.ts`: HTTP 실패 3건 추가. 각 테스트에 `ubuntu-latest` 불변성 주석을 명시했다.

성공 handler의 `PENDING` 완료 모달 동작은 변경하지 않았다. 서버의 409 응답은 `PartnerAuthExceptionHandler.java:26-30`과 `ApiResponse.fail`의 top-level `message`를 통해 전달되며, 클라이언트는 이를 우선 표시한다.

### 9.4 검증 원문

`npx vitest run`:

```text
 RUN v2.1.9 C:/dev/Samhan-Public/.claude/worktrees/t992/clients/web/order-app

 ✓ src/__tests__/sanity.test.ts (2 tests)
 ✓ src/__tests__/commSetIndex.test.ts (1 test)
 ✓ src/__tests__/legacyConfigMapping.test.ts (2 tests)
 ✓ src/__tests__/bootstrapFailure.test.ts (2 tests)
 ✓ src/__tests__/priceChangeSchedule.test.ts (10 tests)
 ✓ src/__tests__/sol2QuantityFix.test.ts (9 tests)
 ✓ src/__tests__/commercialManualSymmetry.test.ts (9 tests)
 ✓ src/__tests__/legacyPreexistingFix.test.ts (2 tests)
 ✓ src/version/versionCheck.test.ts (5 tests)
 ✓ src/__tests__/homeManualLockRestore.test.ts (16 tests)
 ✓ src/__tests__/homeOptionAndZeroLockRestore.test.ts (10 tests)
 ✓ src/__tests__/commManualLockRestore.test.ts (24 tests)
 ✓ src/version/versionGate.test.ts (2 tests)
 ✓ src/__tests__/samhanApi.test.ts (9 tests)
 ✓ src/__tests__/legacyResponseContract.test.ts (10 tests)
 ✓ src/__tests__/legacy-quantity-golden.test.ts (73 tests)
 ✓ src/__tests__/priceParityS3.test.ts (7 tests)

 Test Files 17 passed (17)
      Tests 193 passed (193)
   Start at 22:47:30
   Duration 1.14s (transform 981ms, setup 0ms, collect 1.73s, tests 1.10s, environment 2ms, prepare 4.82s)
```

`npm run typecheck`:

```text
> @samhan/order-app@0.4.0 typecheck
> tsc -p tsconfig.json --noEmit
```

이번 라운드에는 Java 코드 변경이 없어 partner-auth-service Gradle 테스트는 재실행하지 않았다. Docker, 서버 재기동, Playwright, 라이브QA는 실행하지 않았다. 신규 파일은 없으며, 기존 `legacyResponseContract.test.ts`에 실패 경로 테스트 3건을 추가했다.
