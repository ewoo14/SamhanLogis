# R49 · #1057 / #874 vendor 멱등 계약 보고서

## 0. 전제 실측 — 구현 전 확인

협업 수정완료 알림의 실제 호출 경로는 다음과 같다.

```text
accounting-service
  JournalCollabEditService.commitEdit()
    -> sendNotifications()
      -> NotificationClient.sendUserPush()
        -> POST notification-service /internal/notifications/send
          request.channel = PUSH
            -> NotificationService
              -> FcmPushAdapter
```

따라서 이 협업 수정 알림은 SMS가 아니라 **FCM PUSH**를 탄다. `NotificationClient`는 현재
멱등 키를 보내지 않고, 호출은 회계전표 mutation 트랜잭션 내부에서 동기 실행되며 실패를
graceful fallback으로 삼는다.

| 채널 | 이 협업 사건 사용 여부 | vendor 요청 멱등 키 | 발송 후 조회 | 근거 |
|---|---|---|---|---|
| FCM PUSH | **사용** | **없음**. HTTP v1 send 계약은 `message.token`/`notification`/`data` 등을 받고, 성공 응답은 `name`(FCM message ID)이다. 동일 요청의 dedupe 키 필드나 재전송 dedupe 보장이 없다. | 특정 `name`의 사용자 도달 여부를 조회하는 API 없음. FCM delivery data는 BigQuery export/집계 관측이며, 실시간 단건 도달 판정 API가 아니다. | 코드: `FcmPushAdapter`, `NotificationClient`; 공식 문서: [FCM HTTP v1 send](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [FCM REST projects.messages.send](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages/send), [FCM delivery](https://firebase.google.com/docs/cloud-messaging/understand-delivery) |
| SMS / Aligo | **이 사건은 미사용** | 코드상 `AligoSmsAdapter`는 `key`, `user_id`, `sender`, `receiver`, `msg`, `testmode_yn`만 전송한다. vendor 멱등 키를 전송하지 않는다. | 이 라운드의 사건에는 적용되지 않는다. Aligo 발송 성공 응답의 식별자 `msg_id`는 코드상 저장되지만, 이 사건의 채널이 아니므로 Aligo 사후 조회 계약을 이 사건의 exactly-once 근거로 사용할 수 없다. | 코드: `AligoSmsAdapter`, `AligoProperties`; vendor API endpoint: `https://apis.aligo.in/send/` |

### 전제 판정

PM의 “외부 발송 경로” 전제는 **부분적으로 맞다**. 외부 vendor는 타지만, 협업 수정 알림은
Aligo SMS가 아니라 FCM PUSH다. 이 사실을 기준으로 설계하며, SMS 경로를 협업 알림에 억지로
포함하지 않는다.

## 1. RED-first 실패 원문

### RED-A — 저장 롤백인데 외부 알림이 나갈 수 있음

실패 원문(코드 경계):

```text
JournalCollabEditService.commitEdit() @Transactional
  applyOverlayPatchBatch()
  suggestionRepository.save(edit)
  sendNotifications()                 // transaction commit 전 FCM 호출
  publisher.publish()
  return
```

외부 호출은 `TransactionSynchronization.afterCommit` 또는 outbox commit 이후가 아니므로,
뒤의 회계 트랜잭션이 rollback되어도 사용자에게 수정완료 알림이 도달할 수 있다.

### RED-B — gateway 성공 후 local complete 전 종료

실패 원문(코드 경계):

```text
NotificationService.sendWithGatewayResult()
  dispatchPersistence.prepare(req)    // PENDING commit
  invokeGatewayWithResult(prepared)   // FCM 성공, message name 반환
  dispatchPersistence.complete(...)   // 이 직전 프로세스 종료 가능
```

`complete()`가 실행되지 않으면 `notification_requests.status=PENDING`가 남지만, 현재
PENDING 복구 dispatcher가 없다. 복구하지 않으면 영구 누락이고, 무조건 재호출하면 FCM이
동일 요청을 dedupe하지 않으므로 중복 도달 가능성이 있다.

## 2. 계약 결정

FCM은 요청 멱등 키와 단건 사후 도달 조회를 모두 제공하지 않는다. 그러므로 vendor만으로
“누락 없음 + 사용자 exactly-once”를 동시에 증명할 수 없다. 이 라운드의 명시적 선택은:

```text
선택: 누락 허용 안 함 (at-least-once)
대가: FCM provider 한계로 재시도 시 중복 가능
관측: stable event id + local notification request idempotency key + attempt/messageId log
```

동일 저장 사건의 수신자별 event key는 `accounting-journal-edit:{editId}:{recipientUserId}`로
고정한다(구현에서는 이 문자열의 name-based UUID를 notification 멱등 키로 전달한다).
회계 DB outbox는 원 트랜잭션에서만 생성하고, commit 후 dispatcher가 notification-service로
전달한다. notification-service는 같은 key로 하나의 `NotificationRequest`만 생성하며,
PENDING/RETRYING 행을 복구한다. FCM payload에도 event key를 넣어 이후 클라이언트 dedupe
계약을 가능하게 한다. 다만 FCM 자체가 dedupe하지 않으므로, 이 PR에서 vendor exactly-once
불변식을 GREEN이라고 주장하지 않는다.

## 3. 구현 범위

- [x] 회계 transaction-bound outbox 추가: rollback 저장은 outbox/알림 없음
- [x] commit 후 outbox dispatcher 추가: 응답은 외부 호출을 기다리지 않음
- [x] notification-service PENDING recovery 추가
- [x] FCM data payload에 stable event key 추가 및 attempt/messageId 관측
- [ ] mock/stub로 RED-A/RED-B와 정상 저장, 중복 호출 관측 테스트

구현 후에도 FCM vendor 자체 dedupe가 없다는 사실은 변하지 않는다. 따라서 마지막 테스트
항목은 “중복을 vendor가 제거한다”가 아니라, 동일 event key가 로컬 request/outbox에서 한
건으로 묶이고 재시도·FCM message ID가 관측되는지를 검증해야 한다.

## 4. 새 파일 예정

- `services/accounting-service/.../collab/JournalCollabNotificationOutbox.java`
- `services/accounting-service/.../collab/JournalCollabNotificationOutboxRepository.java`
- `services/accounting-service/.../collab/JournalCollabNotificationOutboxDispatcher.java`
- `services/accounting-service/src/main/resources/db/migration/V96__create_journal_collab_notification_outbox.sql`
- `services/notification-service/src/main/java/.../NotificationPendingRecovery.java`
- `services/notification-service/src/main/resources/db/migration/V9__...sql` (필요 시에만)

현재 시점에는 실제 vendor 발송·DB 적용·Docker 조작을 하지 않았다.

## 5. 검증 결과

- `:services:accounting-service:compileJava :services:notification-service:compileJava` — **BUILD SUCCESSFUL**
- `:services:notification-service:test --tests ...NotificationGatewayTest --tests ...NotificationGatewayMetricsTest` — **BUILD SUCCESSFUL** (실 vendor 호출 없음)
- accounting 전체 test source compilation을 동반하는 `NotificationClientTest`/`JournalCollabIT` 좁은 실행은 기존 worktree의 공통 테스트 fixture 누락(`AbstractPostgresIT`, `EcountMigPartialIdentitySupport`)으로 test compile 단계에서 중단됐다. 이 오류는 이번 변경 파일이 아닌 기존 테스트 fixture 해상도 오류이며, 전체 스위트로 확장하지 않았다.

이번 라운드에서 테스트로 확인한 것은 컴파일과 notification gateway mock 계약이다. RED-A/RED-B의
실제 crash 주입 테스트는 DB 적용과 서비스 실행이 필요하므로 가드레일상 수행하지 않았다.

## R50 — 범위 환원

R49의 회계전표 협업 알림 산출물은 이 트랙의 범위를 벗어나므로 전부 제거했다. accounting-service에는
`JournalCollabNotificationOutbox` 3종과 충돌하던 `V96__create_journal_collab_notification_outbox.sql`을
남기지 않는다. 이 작업은 회계서비스의 기존 협업 계약이나 `#1061` 라이브 QA 산출물을 변경하지 않는다.

현재 이슈 #874의 실제 경로는 다음과 같이 slip-service 전용이다.

```text
SlipCollabEditService.commitEdit()
  -> slip_collab_notification_outbox (커밋 트랜잭션)
  -> SlipCollabNotificationOutboxService (커밋 후 비동기 drain)
  -> notification-service /internal/notifications/send (PUSH)
  -> FcmPushAdapter
```

slip outbox의 사건 ID와 notification 수신자 UUID로 name-based UUID를 생성하여 수신자별 안정
멱등 키로 전달한다. notification-service의 FCM adapter는 이 키를 `data.eventId`로 넣고,
PENDING 복구 경로도 유지한다. notification repository의 `findByIdempotencyKeyForUpdate`에는
명시 JPQL을 부여하여 R49 코드가 Spring Data 파생 쿼리로 잘못 해석되어 기동을 막던 결함도 제거했다.

마이그레이션은 notification-service `V9__normalize_blank_notification_idempotency_keys.sql`,
slip-service `V110__index_collab_notification_event.sql`로 버전을 환원 기준보다 높였다.
실제 DB 적용·쓰기·Docker 조작은 하지 않았다.

잔여 위험은 명확하다. FCM 요청 자체는 멱등 키를 받거나 vendor 단건 도달 조회를 제공하지 않으므로,
프로세스가 FCM 성공 직후 local complete 전에 종료되면 PENDING 복구 재발송에서 중복 도달 가능성이
남는다. 따라서 이 경로는 로컬 outbox/request 단위 안정 멱등과 at-least-once를 제공하지만,
vendor exactly-once로 GREEN이라고 주장하지 않는다.

### R50 검증 결과와 차단

요청한 좁은 검증 명령은 다음 결과였다.

```text
.\gradlew.bat :services:slip-service:test --tests '*SlipCollab*' :services:notification-service:test --console=plain
BUILD SUCCESSFUL
28 actionable tasks: 3 executed, 25 up-to-date
```

단, 최종 `git status --porcelain`에는 다음 accounting-service 경로가 남아 있다.

```text
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/NotificationClient.java
 M services/accounting-service/src/main/java/com/samhanair/logis/accounting/collab/JournalCollabEditService.java
```

이 두 변경은 착수 시점부터 존재한 상태이며, 읽기 전용 확인에서 `JournalCollabEditService`가
삭제된 `JournalCollabNotificationOutboxService`를 직접 주입·호출하는 것을 확인했다. 따라서
accounting-service는 현재 이 워크트리에서 컴파일 불능이며, 위 두 파일의 기존 변경을 되돌리거나
참조를 제거해야 한다. 그러나 이는 개발책임자가 준 accounting-service 수정 금지 가드레일과
충돌하므로 R50에서는 수행하지 않았다. 그러므로 “accounting-service 경로가 status에 0개”라는
불변식은 이 세션에서 달성되었다고 보고하지 않는다. PM이 accounting 두 파일의 기존 R49 변경을
되돌릴 권한을 별도로 부여한 뒤에만 이 잔여 차단을 해소할 수 있다.
