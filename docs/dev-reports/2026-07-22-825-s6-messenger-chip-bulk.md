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
