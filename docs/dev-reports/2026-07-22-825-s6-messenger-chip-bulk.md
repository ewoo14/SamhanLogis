# #825 슬6 메신저 수신자 칩 복수선택 구현 보고서

작성일: 2026-07-22 · Issue #866 / PR #892 · CODEX LUNA 5.6

## 범위

- desktop `/messenger` 신설: 수신자 칩 복수선택, 본문 발송, 읽기 전용 수신함
- groupware `POST /admin/groupware/messages/bulk`
- groupware `GET /admin/groupware/messages/recipient-search`
- user-service `/internal/users/search?activeOnly=true` 재직 필터
- 기존 단건 메신저 API 계약 유지 및 deprecated 표기
- groupware V14 `messages.batch_id` nullable 컬럼 + soft-delete partial index

## RED → GREEN 증거

| 대상 | RED 원문 요지 | GREEN 전환 |
|---|---|---|
| R1 | 초기 groupware bulk 통합 테스트가 `MessageBulkSendRequest`, `MessageBulkSendResponse`, `MessageService.sendBulk` 미존재로 `compileTestJava` 7 errors | 미존재 수신자 포함 HTTP가 404, `MessageRepository.count()==0`으로 통과 |
| R2 | 같은 bulk DTO/service compile RED | 5명 응답·5행·동일 batch·UNREAD 확인 통과 |
| R3 | `MessageBulkServiceTest`가 bulk DTO/service 미존재로 compile RED | 누락 수신자 예외 후 `NotificationPublisher` 호출 0건 단위 테스트 통과 |
| R4 | bulk endpoint 미존재 상태에서 bulk 계약 테스트 compile RED | self 포함 HTTP 400 및 저장 0건 통과 |
| R5 | bulk endpoint 미존재 상태에서 bulk 계약 테스트 compile RED | 51명 HTTP 400 및 저장 0건 통과 |
| R6 | bulk service의 표시명 1회 계약을 검증할 대상 메서드가 없어 단위 테스트 compile RED | sender 표시명 resolve 1회 단위 검증 통과 |
| R7 | bulk service의 `verifyBulk` 계약을 검증할 대상 메서드가 없어 단위 테스트 compile RED | dedup 후 `verifyBulk` 정확히 1회 단위 검증 통과 |
| R8 | 최초 통합 실행은 외부 `ServiceDiscoveryClient`를 격리하지 않아 ApplicationContext `NoSuchBeanDefinitionException` RED로 중단 | `DynamicPermissionClient`를 mock하지 않고 `UserClient`만 외부 의존성으로 격리한 실제 MockMvc 요청이 SALES + 무권한 헤더에서 HTTP 403 통과 |
| R9 | 새 active-only search 호출이 아직 없어 endpoint 계약 테스트 대상이 없었음 | SALES 역할·부서 헤더 없음·전용 endpoint가 HTTP 200으로 통과. 결재자 endpoint의 `@RequireDepartment`는 재사용하지 않음 |
| R10 | `InternalUserSearchControllerIT > R10... FAILED`, `AssertionError at ...:110` | user-service 전체 테스트에서 `activeOnly=true` 퇴사자 제외 통과. 기본 false 호출자는 기존 검색 유지 |
| R11 | 기존 단건은 bulk DTO 추가 전 테스트 컴파일 단계에서 함께 RED | 기존 path/request/201 및 응답 필드 회귀 통과 |
| R12 | bulk endpoint/service 미존재로 compile RED | 404 오류 메시지에 missing UUID가 포함되지 않음 통과 |
| R13 | FE 초기 실행은 `MessengerPage` 모듈 부재로 `Failed to load url ./MessengerPage` 및 API 모듈 부재로 `Failed to load url ./messengerApi` | Desktop Vitest에서 수신자 0명 발송 버튼 disabled·POST 0회 통과 |
| R14 | FE 초기 실행은 동일 모듈 load RED | 발송 submit 중 재호출 시 `sendBulkMessage` 1회 통과 |
| R15 | FE 초기 실행은 동일 모듈 load RED | 실제 칩 DOM에 이름·부서만 존재하고 user id 미표시 통과 |
| R16 | FE 초기 실행은 동일 모듈 load RED | 선택한 후보가 재검색 listbox에 다시 나타나지 않음 통과 |

추가로 Playwright Chromium에서 실제 native form validation이 선택된 칩의 빈 autocomplete input을
필수값으로 판단해 `Please fill out this field.`를 표시하고 bulk POST를 0회 만드는 결함을 별도 RED로
확인했다. 버튼 자체의 상태 검증이 권위이므로 form에 `noValidate`를 적용했고, Playwright mock 4건이
다시 GREEN이 되었다.

## 구현 계약

- bulk 요청은 수신자 UUID 목록을 dedup한 뒤 최대 50명으로 제한한다.
- 송신자 본인 포함은 조용히 제거하지 않고 400으로 거부한다.
- `verifyBulk`가 전부 성공한 뒤 한 트랜잭션에서 각 수신자별 Message 행을 저장한다. 실패하면 0건이다.
- 저장 행은 같은 `batchId`, `UNREAD`, 동일 본문을 가진다. 알림은 commit 이후 수신자별 1건이다.
- 오류 문구에는 사용자 UUID를 노출하지 않는다. desktop 화면도 UUID/opaque id를 렌더링하지 않는다.
- 수신자 검색은 `messenger.send` VIEW만 요구하고 부서 제한이 없다. user-service에는 `activeOnly=true`를 전달한다.
- 기존 `POST /admin/groupware/messages`는 경로·요청·응답·상태 코드가 변하지 않는다.

## 실행한 검증

```text
cd clients/desktop && npm run typecheck
> @samhan/desktop@0.1.0 typecheck
> tsc -p tsconfig.node.json --noEmit && tsc -p tsconfig.web.json --noEmit
Exit code: 0

cd clients/desktop && npm run lint
> @samhan/desktop@0.1.0 lint
> eslint "src/**/*.{ts,tsx}"
✖ 77 problems (0 errors, 77 warnings)
Exit code: 0

cd clients/desktop && npm test
Test Files 137 passed (137)
Tests 1079 passed (1079)
Exit code: 0

npx playwright test playwright/ac-825-s6-messenger-chip/ac-825-s6-messenger-chip.spec.ts --reporter=line
Running 4 tests using 1 worker
4 passed (17.0s)
Exit code: 0

./gradlew :services:groupware-service:test :services:user-service:test --rerun-tasks --no-build-cache
BUILD SUCCESSFUL
32 actionable tasks: 32 executed
Exit code: 0
```

PowerShell 5에서는 요청된 `&&` 연결 문법을 지원하지 않아 구문 오류가 발생했다. 같은 세 명령을
실패 시 즉시 중단하는 PowerShell 구문으로 다시 실행했고 위 결과를 확보했다. Gradle은 최초 도구
실행 제한 시간(120초)에 걸린 뒤 동일 명령을 300초 제한으로 재실행해 통과했다.

Desktop typecheck를 실행하기 전 file 링크인 `@samhan/design-system`의 declaration이 없는 초기
환경이어서 design-system 의존성을 설치하고 `clients/web/design-system`만 build했다. design-system
소스는 수정하지 않았다. 린트의 77 warnings는 기존 파일 경고이며 신규 파일 error는 0건이다.

## R1 적대검증 라운드 fix (SONNET5, 2026-07-22)

OPUS 4.8 1차 적대검증 라운드에서 나온 H-1~H-4·M-1~M-7·L-1~L-2 및 검증 결함 4건을 처리했다.

### 고친 항목

- **H-1(보안)** — `GroupwarePermissionControllerIT` 권한 매트릭스에 `bulk send message`(CREATE)·
  `recipient search`(VIEW) 두 엔드포인트를 등재. 뮤테이션(annotation 전체 삭제·CREATE→VIEW 완화)
  둘 다 RED로 확인 후 원복.
- **H-2** — `MessengerPage`의 오류 표시를 `error.message`(axios 영문)에서 정본 헬퍼
  `extractApiErrorMessage`(`api/apiError.ts`)로 교체. BE 한국어 오류가 화면에 그대로 도달한다.
- **H-3** — 현재 사용자 세션(`getAuthProvider().getSession()`)을 조회해 수신자 검색 결과에서
  본인을 사전에 제외. 발송을 눌러야 400을 아는 상태를 제거했다.
- **H-4** — `usePermissions().canAccess('messenger.send','create')`로 발송 폼 전체를
  `<fieldset disabled>`로 잠근다. VIEW-only 계정은 필드 자체를 조작할 수 없다.
- **M-1/M-2** — 수신함 오픈 시 미열람 건을 각각 최대 3회까지 즉시 재시도로 markRead 처리하고,
  성공한 messageId 집합으로만 알림을 확인 처리하도록 `acknowledgeMessengerNotifications(messageIds?)`를
  변경(notification-service `NotificationCenterResponse.refId` 신설로 상관 가능). 진입당 GET/POST
  폭증(N² 패턴) 제거 + 다음 페이지 미열람 쪽지 알림이 먼저 사라지는 결함 제거. 라벨/의미도
  "읽기 전용"을 유지하되 열람 시 자동 읽음 처리는 그대로(되돌릴 수단 없음은 기획 확정 사항).
- **M-3** — `MessageResponse.senderDisplayName` 신설(`resolveDisplayNames` 배치 1회 해석,
  UUID 미노출) + inbox 행에 발신자 표시.
- **M-4** — markRead 재시도 상한(3회) 초과 시 행별 "읽음 처리에 실패했습니다." 알림 + 무한 재시도 금지.
- **M-5** — inbox 컨트롤러에 `page` 쿼리 파라미터 추가(50건 고정 페이지) + FE 이전/다음 페이저.
- **M-6** — 본문 2000자 초과 시 클라이언트에서 명시적으로 잘라내고 카운터("N / 2000자") +
  잘림 안내 문구를 렌더(무음 절단 제거).
- **M-7** — 담당자코드(`employees.ecount_code`) 병기. BE: `RecipientSearchResponse.employeeCode`,
  `UserClient.ApproverSummary.employeeCode`, user-service `InternalEmployeeSearchResponse.ecountCode`
  신설. FE: 검색 결과 배치 내 동명이인(2건 이상)에만 `(코드)` 병기, 그 외엔 이름·부서만. mock에
  실측 사례(채권추심 2건 · 00000/999-99-99999)를 시드해 Playwright로 실증.
- **L-1** — `markRead` 404 오류 메시지에서 messageId UUID 노출 제거(bulk 발송 경로와 동일 정책).
- **L-2** — 수신자 50명 상한 도달 시 "검색 결과 없음"과 구분되는 전용 안내("최대 50명까지…") 표시.
- **검증 결함 4건** — ①위 H-1 매트릭스 등재 ②`MessageBulkSendIT.R2`에 `messageRepository.findAllByBatchId(batchId)`
  실 DB 조회 단언 추가(응답 JSON만 보던 것에서 전환) ③`UserClientSearchActiveOnlyTest` 신설
  (`MockRestServiceServer`로 `activeOnly=true/false` 쿼리파라미터 배선 계약 검증) + 컨트롤러 배선
  자체도 `MessageBulkSendIT.R9`에 `verify(userClient).search(...,true)` 추가 ④mock.ts 메신저
  섹션에 `mockRequirePermission` 배선, self/미존재 수신자 400/404 경로, UUID 형식 시드 id로 교체.

### RED-first 뮤테이션 재확인 (실행 원문 — 4건 전부 RED 확인 후 원복)

| 뮤테이션 | 대상 | 결과 |
|---|---|---|
| A. `@RequirePermission` 완전 삭제(bulk+recipient-search) | `GroupwarePermissionControllerIT`, `MessageBulkPermissionIT` | RED (3 tests failed) |
| B. bulk action CREATE→VIEW 완화 | `GroupwarePermissionControllerIT` | RED (1 test failed) |
| C. 수신자별 다른 batchId 부여 | `MessageBulkSendIT.R2`(DB 조회 단언) | RED (`findAllByBatchId` size 불일치) |
| D/E. 컨트롤러 activeOnly true→false / `UserClient` 쿼리파라미터 배선 삭제 | `MessageBulkSendIT.R9`(verify) / `UserClientSearchActiveOnlyTest` | 둘 다 RED |

각 뮤테이션은 적용 직후 대상 테스트 실행으로 RED를 확인한 뒤 즉시 원복했고, 원복 후
groupware-service 177 / user-service 309(스킵 4, 무관) / notification-service 225 테스트
전부 GREEN을 재확인했다(`--rerun-tasks --no-build-cache`).

### QA 스크린샷 재촬영

기존 `01-messenger-bulk-chips.png`는 발송 클릭 후(폼 초기화 상태)로 캡처돼 칩이 보이지 않았다.
Playwright 스펙에서 스크린샷 위치를 발송 클릭 **전**으로 이동해 칩 2개·본문·수신함(발신자명·
읽음 상태)·페이저·본문 카운터가 모두 보이는 상태로 재촬영했다.

### 실행한 검증 (이번 라운드)

```text
cd clients/desktop && npm run typecheck   → 0 errors
cd clients/desktop && npm run lint        → 0 errors, 79 warnings(기존 파일; 신규 파일 0)
cd clients/desktop && npx vitest run      → 137 files / 1093 tests passed
npx playwright test playwright/ac-825-s6-messenger-chip --reporter=line (mock :5179 전용 포트)
  → 6 passed (R13/R17/R15/R16/R2/M-7 신규)
./gradlew :services:groupware-service:test :services:user-service:test :services:notification-service:test \
  --rerun-tasks --no-build-cache
  → BUILD SUCCESSFUL, groupware 177 / user-service 309(skip 4) / notification-service 225 전부 green
```

### 미완/보류

- markRead 재시도는 페이지 진입당(mount) 한도(3회)이며, 사용자가 페이지를 다시 열면 카운터가
  리셋된다 — 영구 실패 메시지가 페이지 재진입마다 재시도될 수 있음(다음 재수렴 후보, 실 사용자
  경로 도달성은 낮음: 동일 실패가 반복되려면 markRead가 지속적으로 실패해야 함).
- 라이브 GUI QA(:8080 실서버, mock OFF)는 이번 라운드에서 재실행하지 않았다 — 이 fix 라운드는
  mock/단위/IT 계층 결함 처리이며, 실서버 캡처는 다음 적대검증 라운드(CODEX SOL 5.6) 또는 PM
  최종 종합 단계에서 필요.

## 보류 / 미완

- 실제 gateway + 운영 user-service/groupware-service를 연결한 라이브 GUI QA는 이 워크트리에서 실행하지 않았다. mock Chromium, MockMvc/Testcontainers, 단위 테스트까지는 통과했다.
- PR commit/push/merge는 구현 범위 밖이며 개발책임자 승인 후 PM이 수행한다.

## CODEX LUNA R2 — PR #892 적대검증 fix (2026-07-22)

### 1-1 검색 후 퇴사 처리된 직원 발송 차단

RED 원문:

```text
MessageBulkServiceTest.java:66: error: cannot find symbol
when(userClient.verifyActiveBulk(recipients))
symbol: method verifyActiveBulk(List<UUID>)
1 error
Execution failed for task ':services:groupware-service:compileTestJava'
```

수신자 검색의 `activeOnly=true`는 검색 시점 필터일 뿐이므로, 발송 직전에는 별도 user-service
`POST /internal/users/verify-active-bulk`를 호출하도록 추가했다. user-service는
`terminationDate IS NULL`인 행만 true로 반환하고, groupware는 false인 수신자를 저장/알림 전에
한국어 사유(`퇴사했거나 재직 상태가 아니어서 발송할 수 없습니다`)로 거부한다. client 장애나
응답 파싱 실패도 fail-closed로 처리해 자격 확인 없이 발송하지 않는다.

GREEN 원문:

```text
BUILD SUCCESSFUL in 14s
7 tests completed, 0 failed
27 actionable tasks: 27 executed
```

추가 endpoint 계약·현직/퇴사/미존재 응답 IT도 포함했고, 최종 3-service 실행에서 재검증했다.

### 1-2 저장 후 알림 유실 관측/복구 가능성 보강

RED 원문:

```text
NotificationPublisherTest > publish: 일시 장애는 제한적으로 재시도하여 알림 유실 가능성을 줄인다 FAILED
java.lang.AssertionError at NotificationPublisherTest.java:111
3 tests completed, 1 failed
```

commit 이후 publisher의 단일 HTTP 시도를 최대 3회 bounded retry로 바꿨다. 마지막 실패는 기존처럼
source transaction을 깨지 않도록 fail-soft로 남기되, 재시도 횟수와 channel/ref를 warn log에 남긴다.
이번 라운드에서는 outbox/재처리 테이블을 전면 도입하지 않았다. outbox는 별도 슬라이스 규모이며,
이번 범위의 최소선인 일시 장애 복구 시도와 최종 실패 관측(log)을 적용한 뒤 멈췄다. 따라서 3회 모두
실패한 경우의 영구 복구는 여전히 운영 outbox 후속 과제다.

GREEN 원문:

```text
BUILD SUCCESSFUL in 3s
4 actionable tasks: 4 executed
```

### 3-1 acknowledge 실패 후 배지 복구

RED 원문:

```text
MessengerPage > R3-1 acknowledge가 일시 실패해도 같은 화면에서 재시도하여 배지를 복구한다
expected "acknowledgeMessengerNotifications" to be called 2 times, but got 1 times
```

markRead 성공 ID의 acknowledge를 최대 3회 즉시 재시도하고, 성공한 뒤에만 notifications query를
invalidate하도록 유지했다.

GREEN 원문:

```text
MessengerPage.test.tsx > R3-1 ... ✓
1 passed, 18 skipped
```

### 3-2 같은 화면의 markRead 재시도

RED 원문:

```text
MessengerPage > R3-2 markRead 3회 실패 후 refetch하면 같은 화면에서 해당 쪽지를 재시도한다
expected "markMessageRead" to be called 4 times, but got 3 times
```

시도 중 ID는 별도 in-flight set으로 중복 호출만 막고, 성공한 ID만 영구 marked set에 넣는다.
최종 실패 ID는 in-flight에서 제거하므로 같은 화면의 inbox refetch가 회복 후 다시 시도한다.

GREEN 원문:

```text
MessengerPage.test.tsx > R3-2 ... ✓
1 passed, 18 skipped
```

### 3-3 발송 오류 피드백 보존

RED 원문:

```text
MessengerPage > R3-3 늦게 끝난 읽음 실패가 발송 오류 사유를 덮어쓰지 않는다
expected "markMessageRead" to be called 3 times, but got 1 times
```

발송 피드백과 백그라운드 읽음 피드백을 별도 state로 분리하고, 화면의 우선순위를 발송 피드백에
두었다. 읽음 실패는 행별 alert로도 계속 드러난다.

GREEN 원문:

```text
MessengerPage.test.tsx > R3-3 ... ✓
1 passed, 18 skipped
```

### R2 뮤테이션 RED

```text
active guard 조건을 false로 mutation:
MessageBulkServiceTest > R2_검색후_퇴사한_수신자는_발송시점에_거부하고_저장하지_않는다 FAILED
1 failed

publisher MAX_ATTEMPTS=1 mutation:
NotificationPublisherTest > 일시 장애는 제한적으로 재시도... FAILED
NotificationPublisherTest > 장애 시 예외를 전파하지 않는다 FAILED
2 failed

FE acknowledge 상한 1 mutation:
R3-1 expected acknowledge... to be called 2 times, but got 1 times

FE markRead 실패 ID를 marked set에 추가하는 mutation:
R3-2 expected markMessageRead to be called 4 times, but got 3 times

FE feedback 우선순위 역전 mutation:
R3-3 Unable to find an element with the text: 발송할 수 없는 사유
```

모든 mutation은 확인 직후 원복했다.

### R2 최종 검증

```text
clients/desktop npm run typecheck
Exit code: 0

npx vitest run src/renderer/routes/MessengerPage.test.tsx src/renderer/api/messengerApi.test.ts
Test Files 2 passed (2)
Tests 24 passed (24)

gradlew.bat :services:groupware-service:test :services:user-service:test :services:notification-service:test --rerun-tasks --no-build-cache
BUILD SUCCESSFUL in 1m 13s
37 actionable tasks: 37 executed

PLAYWRIGHT_SKIP_WEB_SERVER=1 AUDIT_BASE_URL=http://127.0.0.1:5179
npx playwright test playwright/ac-825-s6-messenger-chip --reporter=line
6 passed (7.2s)
```

처음 5173 기본 Playwright 실행은 기존 다른 개발 서버 재사용으로 `/messenger`가 404가 되어 6건
실패했다. 해당 snapshot의 404를 확인한 뒤 이 워크트리 전용 5179 mock Vite에서 같은 스펙만
재실행해 6/6 통과했다. 전체 Playwright suite는 실행하지 않았다.

### 변경 파일

- `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationPublisherSupport.java`
- `shared/notification-publisher/src/test/java/com/samhanair/logis/notification/publisher/NotificationPublisherSupportTest.java`
- `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationPublisherAutoConfiguration.java`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/client/UserClient.java`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/MessageService.java`
- `services/groupware-service/src/test/java/com/samhanair/logis/groupware/client/UserClientSearchActiveOnlyTest.java`
- `services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/MessageBulkSendIT.java`
- `services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/MessageBulkServiceTest.java`
- `services/user-service/src/main/java/com/samhanair/logis/user/repository/EmployeeRepository.java`
- `services/user-service/src/main/java/com/samhanair/logis/user/web/InternalUserController.java`
- `services/user-service/src/test/java/com/samhanair/logis/user/it/InternalUserSearchControllerIT.java`
- `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationPublisher.java`
- `shared/notification-publisher/src/test/java/com/samhanair/logis/notification/publisher/NotificationPublisherTest.java`
- `services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/MessageServiceTest.java`
- `clients/desktop/src/renderer/routes/MessengerPage.tsx`
- `clients/desktop/src/renderer/routes/MessengerPage.test.tsx`

### 미해결/RED 불가 및 새로 발견한 결함

- 이번 R2 도달가능 5건은 모두 RED→GREEN 처리했다.
- 1-2는 outbox를 도입하지 않았으므로 3회 retry 모두 실패한 알림의 영구 복구는 미해결이다.
- 5173 Playwright 실패는 코드 RED가 아니라 다른 서버 재사용에 따른 환경성 404였고, 전용 5179에서
  동일 스펙을 통과시켰다.
- fix 과정에서 `UserClient.parseBooleanMap`의 Jackson checked exception 누락을 새로 발견해
  fail-closed 빈 map 처리로 보완했다.
- 요청 범위 밖 5-1, 1-3, 3-4, 3-5, 4-1은 건드리지 않았다.

### PM 후속 검증 — 알림 재시도가 발송 응답을 지연시키는 문제

#### 1. `loadBalancedRestClientBuilder` timeout 확인

확인 결과 이 경로에는 명시적인 timeout이 없었다.

```text
services/notification-service/.../WebClientConfig.java:30
public RestClient.Builder loadBalancedRestClientBuilder() {
    return RestClient.builder();
}

services/groupware-service/.../WebClientConfig.java:26
public RestClient.Builder loadBalancedRestClientBuilder() {
    return RestClient.builder();
}

shared/notification-publisher/.../NotificationPublisherAutoConfiguration.java:23-26
@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder loadBalancedBuilder,
...
return new NotificationPublisher(loadBalancedBuilder, internalToken, applicationName);
```

`NotificationPublisher`에도 `requestFactory`, `setConnectTimeout`, `setReadTimeout` 또는 timeout
property 주입이 없다. 따라서 이 publisher 호출에 이미 충분히 짧은 상한이 있다고 근거를 제시할 수
없다.

#### 2. 즉시 재시도의 효과 판단 및 fix

현재 재시도 테스트는 첫 요청이 빠른 HTTP 500이고 두 번째가 성공하는 경우를 검증한다. 이 경우에는
즉시 재시도가 실제로 빠른 서버 오류를 복구한다. 반대로 응답 지연/읽기 timeout은 `RestClientException`
이 발생하기 전까지 재시도할 수 없으므로, backoff 없는 재시도가 그 장애를 복구한다는 근거는 없다.
이번 범위에서는 3회 retry와 마지막 warn log를 유지했다. 빠른 5xx 복구와 fail-soft/관측 계약을
보존하면서, 느린 호출을 사용자 요청에서 분리하는 것이 이 결함에 직접 맞는 최소 변경이기 때문이다.

RED 원문:

```text
NotificationPublisherSupportTest > publishAfterCommit_doesNotBlockAfterCommitCallbackOnPublisherHttpCall() FAILED
org.opentest4j.AssertionFailedError at NotificationPublisherSupportTest.java:75
3 tests completed, 1 failed
BUILD FAILED
```

고침:

`NotificationPublisherSupport.publishAfterCommit`의 `afterCommit` callback은 이제
`CompletableFuture.runAsync`로 publisher HTTP fan-out을 넘기고 즉시 반환한다. 따라서 groupware의
수신자별 순차 발행 및 publisher의 제한적 재시도 계약은 유지하면서, commit 후 callback이 사용자
발송 응답을 notification-service의 네트워크 상태만큼 붙잡지 않는다. transaction synchronization이
없는 기존 경로는 기존처럼 즉시 호출한다. outbox, 재시도 큐, 공유 executor 도입은 하지 않았다.

GREEN 원문:

```text
shared:notification-publisher NotificationPublisherSupportTest
3 tests completed, 0 failed
BUILD SUCCESSFUL in 4s
4 actionable tasks: 4 executed
```

뮤테이션 RED 원문:

```text
CompletableFuture.runAsync(...)를 publisher.publish(request) 동기 호출로 mutation:
NotificationPublisherSupportTest > publishAfterCommit_doesNotBlockAfterCommitCallbackOnPublisherHttpCall() FAILED
org.opentest4j.AssertionFailedError at NotificationPublisherSupportTest.java:74
3 tests completed, 1 failed
BUILD FAILED
```

뮤테이션은 확인 직후 원복했다. 비동기 변경으로 기존 `MessageServiceTest`의 동기 `verify`가
실패했으므로 eventual verify로 바꿨고, 이 변경 후 groupware 전체 테스트도 다시 실행했다.

최종 후속 검증:

```text
clients/desktop npm run typecheck
Exit code: 0

npx vitest run src/renderer/routes/MessengerPage.test.tsx src/renderer/api/messengerApi.test.ts
Test Files 2 passed (2)
Tests 24 passed (24)

gradlew.bat :shared:notification-publisher:test --rerun-tasks --no-build-cache
BUILD SUCCESSFUL in 4s
4 actionable tasks: 4 executed

gradlew.bat :services:groupware-service:test --rerun-tasks --no-build-cache
BUILD SUCCESSFUL in 58s
27 actionable tasks: 27 executed
```

초기 groupware 재실행에서 기존 동기 `verify` 단언 1건이 실패했으나, 이는 비동기 계약에 맞지 않는
테스트 기대치였고 eventual verify로 수정 후 동일한 전체 groupware task가 `BUILD SUCCESSFUL`로
통과했다(초기 실패 출력에는 179 tests completed, 1 failed가 기록됨).

초기 후속 fix 시점에는 사용자 요청 응답의 경계만 확보하고 비동기 background publisher 자체의
HTTP timeout은 남겨 두었으나, PM 최종 후속에서 아래 종료 보장을 추가했다. outbox나 공유 executor로
확장하지 않았고, 현재 실패는 기존 publisher의 warn log로 관측된다.

### PM 최종 후속 — 비동기 publisher 작업의 종료 보장

비동기 전환으로 공용 `ForkJoinPool`을 사용하더라도 각 blocking HTTP 시도가 무한히 남지 않도록
`SimpleClientHttpRequestFactory`에 connect timeout 1,000ms / read timeout 2,000ms를 명시했다.
재시도 3회 상한과 결합되어 한 알림 발행 작업은 유한한 HTTP 시도만 수행한다. 운영 환경별 조정이
필요하면 다음 property로 값을 바꿀 수 있으며, 0 이하 값은 startup 시 거부한다.

```text
samhan.notification-publisher.connect-timeout-ms: 1000
samhan.notification-publisher.read-timeout-ms: 2000
```

RED 원문:

```text
NotificationPublisherTest > 생성 시 notification HTTP connect/read timeout을 유한하게 설정한다 FAILED
org.mockito.exceptions.verification.WantedButNotInvoked at NotificationPublisherTest.java:35
4 tests completed, 1 failed
BUILD FAILED
```

고침:

`NotificationPublisher` 생성 시 timeout이 설정된 request factory를 사용하도록 하고,
`NotificationPublisherAutoConfiguration`에서 위 property를 주입했다. 테스트에는 실제 로컬
HTTP server가 응답하지 않는 상황에서 publisher 호출이 2초 안에 반환되는 경계 테스트를 추가했다.
기존 `MockRestServiceServer` 테스트는 mock request factory를 보존하는 test builder로 격리했다.

GREEN 원문:

```text
응답 없는 notification-service도 timeout과 재시도 상한 안에 종료한다: PASSED
생성 시 notification HTTP connect/read timeout을 유한하게 설정한다: PASSED

gradlew.bat :shared:notification-publisher:test --rerun-tasks --no-build-cache
BUILD SUCCESSFUL in 5s
4 actionable tasks: 4 executed
```

뮤테이션 RED 원문:

```text
readTimeout을 0으로 mutation:
NotificationPublisherTest > 응답 없는 notification-service도 timeout과 재시도 상한 안에 종료한다 FAILED
Caused by: org.junit.jupiter.api.AssertTimeoutPreemptively$ExecutionTimeoutException at NotificationPublisherTest.java:60

NotificationPublisherTest > 생성 시 notification HTTP connect/read timeout을 유한하게 설정한다 FAILED
5 tests completed, 2 failed
BUILD FAILED
```

뮤테이션은 확인 직후 원복했다. 전용 bounded executor, outbox, 재처리 정책, circuit breaker는 추가하지
않았다. 이번 결함의 최소 불변식인 “비동기 알림 발행 시도가 유한 시간 안에 끝난다”는 HTTP timeout과
기존 3회 retry 상한으로 닫았다.

최종 요청 검증 출력:

```text
clients/desktop npm run typecheck
Exit code: 0

gradlew.bat :shared:notification-publisher:test --rerun-tasks --no-build-cache
BUILD SUCCESSFUL in 5s
4 actionable tasks: 4 executed

gradlew.bat :services:groupware-service:test --rerun-tasks --no-build-cache
BUILD SUCCESSFUL in 1m
27 actionable tasks: 27 executed
```

공유 load-balanced builder 변이 방지를 위해 publisher가 `clone()`을 사용하도록 마지막 보완한 뒤
동일 검증을 다시 실행한 최종 출력:

```text
gradlew.bat :shared:notification-publisher:test --rerun-tasks --no-build-cache
BUILD SUCCESSFUL in 4s
4 actionable tasks: 4 executed

gradlew.bat :services:groupware-service:test --rerun-tasks --no-build-cache
BUILD SUCCESSFUL in 58s
27 actionable tasks: 27 executed

clients/desktop npm run typecheck
Exit code: 0
```
