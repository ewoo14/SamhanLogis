# PR #994 (#895 대시보드 일정관리) — 확정 일정 대상자 알림 라운드 fix

작성일: 2026-07-30
브랜치: `feat/895-dashboard-schedule`
작업 범위: SOL R3에서 `CONFIRMED` 도달 가능으로 판정된 대상자 알림 결함 1건

## 1. 원인

개발책임자가 확정한 진단을 기준으로 재조사하지 않고, 회귀 테스트와 구현으로 바로 수렴했다.

```text
ScheduleStatus.java:7-9
  CONFIRMED 를 "참여자 알림 / 캘린더 노출 대상" 으로 정의한다  ← 이 PR 자신의 계약

ScheduleService.java:23-49   생성: 참여자 행만 저장하고 끝난다
ScheduleService.java:84-101  수정으로 새 참여자를 추가해도 발행이 없다
ScheduleRequest.java:24-31   알림 시각/정책 필드가 없다

같은 서비스의 정상 알림 경로
MessageService.java:35-38,53-68
  NotificationPublishRequest 를 만들고 after-commit publisher 호출
NotificationCenterService.java:31-40
  publish 요청이 들어와야 알림 행이 저장된다
```

즉 기존 일정 생성·수정 경로에는 `NotificationPublisher` 호출이 없었고,
`notification-service`의 `notification_center` 행을 만들 수 있는 유일한 내부 발행 경로에
도달하지 않았다.

## 2. RED-first 원문

추가한 첫 회귀 테스트는 실제 `ScheduleService.create()` 경로로 `CONFIRMED` 일정과 참여자를
만들고, commit 전에는 publisher가 호출되지 않으며 `afterCommit` 후에는 대상자 요청이
발행되어야 한다고 단언한다. raw SQL fixture는 사용하지 않았다.

실행 명령:

```powershell
$env:GRADLE_USER_HOME = 'D:\dev\Samhan-Public\.gradle-t20'
.\gradlew :services:groupware-service:test `
  --tests 'com.samhanair.logis.groupware.service.ScheduleServiceTest.create_confirmed_schedule_publishes_to_each_participant_after_commit' `
  --rerun-tasks --no-daemon --console=plain
```

원문 결과:

```text
> Task :services:groupware-service:test

ScheduleServiceTest > create_confirmed_schedule_publishes_to_each_participant_after_commit() FAILED
    org.mockito.exceptions.verification.WantedButNotInvoked at ScheduleServiceTest.java:90

> Task :services:groupware-service:test FAILED
27 actionable tasks: 27 executed

1 test completed, 1 failed

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':services:groupware-service:test'.
> There were failing tests. See the report at: file:///D:/dev/Samhan-Public/.claude/worktrees/w994-schedule/services/groupware-service/build/reports/tests/test/index.html

BUILD FAILED in 1m 17s
```

## 3. fix

- `ScheduleService.create/update/addParticipant()`가 저장·변경된 일정에 대해
  `publishPendingNotifications()`를 호출한다.
- helper는 `CONFIRMED`일 때만 활성 참여자를 순회하고, 각 요청에
  `targetRole=null`, `targetUserId=<참여자 UUID>`를 넣는다. 등록자나 제3자 role 대상은
  별도로 추가하지 않는다.
- `NotificationPublisherSupport.publishAfterCommit(...)`와 전용
  `NotificationPublisherDispatchExecutor`를 사용해 transaction synchronization의
  `afterCommit` 뒤 publisher를 실행한다. `@Async`를 추가하지 않았으므로 `@Primary` executor
  해석 함정에 의존하지 않는다.
- `schedule_participants.notification_requested_at`을 V16으로 추가했다. 같은 일정·참여자
  행이 이미 요청되었으면 다시 발행하지 않는다. 참여자 제거도 hard delete하지 않고 soft-delete하며
  발행 요청 시각을 보존하므로 삭제 후 재추가도 중복 발행하지 않는다.
- 일정 제목은 `NotificationCenter.title VARCHAR(200)` 계약에 맞게 알림용 prefix를 포함해
  200자 이내로 자른다.
- 기존 `NotificationPublisher`의 fail-soft 계약을 그대로 사용한다. notification-service
  HTTP 4xx/5xx·연결 실패는 warn/error 로그로 관측되고 source 일정 transaction에는 영향을 주지
  않는다. 발행 요청 시각을 일정 transaction 안에 기록하지만 실제 HTTP 호출은 commit 이후다.
- 데스크톱 공통 알림 라벨에 `SCHEDULE: '일정'`을 추가했다. 캘린더 UI나 일정 화면은 변경하지
  않았다.

## 4. GREEN 원문

### 4-1. 일정 회귀 테스트

최종 실행 명령:

```powershell
$env:GRADLE_USER_HOME = 'D:\dev\Samhan-Public\.gradle-t20'
.\gradlew :services:groupware-service:test `
  --tests 'com.samhanair.logis.groupware.service.ScheduleServiceTest' `
  --rerun-tasks --no-daemon --console=plain
```

원문 결과:

```text
> Task :services:groupware-service:test

BUILD SUCCESSFUL in 33s
27 actionable tasks: 27 executed
```

### 4-2. groupware-service 비-IT 전체

Testcontainers/IT 클래스는 Docker 금지 지시로 실행하지 않고 `*Test` 패턴만 실행했다.

실행 명령:

```powershell
$env:GRADLE_USER_HOME = 'D:\dev\Samhan-Public\.gradle-t20'
.\gradlew :services:groupware-service:test `
  --tests '*Test' --rerun-tasks --no-daemon --console=plain
```

원문 결과:

```text
> Task :services:groupware-service:test

BUILD SUCCESSFUL in 43s
27 actionable tasks: 27 executed
```

테스트 XML 실측:

```text
xml_files=18 tests=101 failed_or_errors=0 skipped=0
```

`--rerun-tasks`를 사용해 `UP-TO-DATE`/`FROM-CACHE` 판정 없이 실제 task를 실행했다.

## 5. 7개 불변식 확인표

| 불변식 | 확인 방법과 결과 |
|---|---|
| 1. `CONFIRMED` 대상자는 알림을 받으며 데스크톱 벨/내역에 보임 | `ScheduleServiceTest.java:61-98`에서 실제 service create 경로의 `NotificationPublishRequest`를 캡처해 `channel=SCHEDULE`, `targetUserId=참여자`를 확인했다. 발행 요청은 `notification-service` 내부 endpoint와 `NotificationCenterService.publish()`를 거쳐 `notification_center`에 저장되며, 데스크톱은 `notificationApi.ts:39-49`로 unread/history를 조회하고 `NotificationBellDropdown.tsx:30-35,81-90,153-166`에서 렌더한다. `notificationApi.ts:89-95`의 `SCHEDULE → 일정` 라벨도 추가했다. 공유 실서버·브라우저 QA는 지시상 실행하지 않았다. |
| 2. 대상자가 아닌 사용자는 받지 않음 | helper가 `schedule.getParticipantsView()`만 순회하고 `targetRole=null`·개별 `targetUserId`만 생성한다(`ScheduleService.java:145-169`). 생성 회귀 테스트에서 publisher 요청을 1건 캡처하고 role 대상이 null임을 확인했다. |
| 3. 수정으로 새 대상자 추가 시 수신, 기존 대상자 중복 없음 | `ScheduleServiceTest.java:149-206`에서 이미 요청된 기존 참여자와 신규 참여자를 `update()`로 함께 제출하고 신규 참여자만 1건 발행했다. 이후 동일 수정, 기존 참여자 제거, 신규 참여자 재추가를 거쳐도 총 발행은 `times(1)`이다. 상태는 `ScheduleParticipant.notificationRequestedAt`과 V16 migration으로 보존한다. |
| 4. 알림 실패가 일정 저장을 되돌리지 않으며 실패가 묻히지 않음 | 실제 HTTP 발행은 commit 후에만 수행되고, 기존 `NotificationPublisher.java:69-101`이 notification-service 4xx/5xx·예외를 warn/error 로그로 남기며 throw하지 않는 fail-soft 계약을 유지한다. queue 거부는 `NotificationPublisherSupport.java:50-56`에서 error 로그를 남긴다. 이 라운드에서는 공유 notification DB에 장애 fixture write를 하지 않았다. |
| 5. commit 전 발행 금지 | `NotificationPublisherSupport.java:37-48`의 `afterCommit` 등록 경로를 사용한다. `ScheduleServiceTest.java:78-89`는 commit callback 전 publisher 미호출을 확인하고, `:121-147`은 rollback에서 callback을 호출하지 않아 미발행임을 확인한다. |
| 6. `CONFIRMED` 외에는 미발행 | `ScheduleService.java:145-147`의 상태 가드와 `ScheduleServiceTest.java:100-119`의 `DRAFT` 테스트로 확인했다. `CANCELLED`도 같은 가드에 의해 발행하지 않는다. |
| 7. 기존 메신저 동작 불변 | `MessageService.java`는 변경하지 않았다. 최종 groupware 비-IT 실행 101건에 기존 `MessageServiceTest`·`MessageBulkServiceTest`가 포함되어 모두 통과했다. 일정 알림은 별도 `SCHEDULE` 채널과 별도 service helper로 추가했다. |

## 6. 실제 발행 착지점

```text
ScheduleService.java:168-169
  → NotificationPublisherSupport.publishAfterCommit(...)
    → NotificationPublisherSupport.java:37-42
      → afterCommit에서 NotificationPublisherDispatchExecutor.execute(...)
        → NotificationPublisherDispatchExecutor.java:46-49
          → NotificationPublisher.java:74-93
            → POST /internal/notifications
              → NotificationCenterInternalController.java:30-35
                → NotificationCenterService.java:33-40
                  → notification_center INSERT
```

실제 발행은 `@Async` 착지점이 아니다. 전용 `NotificationPublisherDispatchExecutor`에 명시적으로
넘기므로 `@Primary` 빈 때문에 다른 executor로 착지하는 경로를 사용하지 않는다.

## 7. 검증 범위 및 미실행 항목

- Gradle은 요청대로 `GRADLE_USER_HOME=D:\dev\Samhan-Public\.gradle-t20`과
  `:services:groupware-service:test` 범위만 사용했다.
- Docker/Testcontainers를 시작하지 않았다.
- 공유 `notification_db`·`groupware_db`에 write하지 않았다.
- raw SQL로 실 API가 만들 수 없는 fixture를 만들지 않았다. 테스트 fixture는
  `ScheduleService.create/update()`와 도메인 API로만 구성했다.
- GET 405/500, 등록자 목록 표시, 캘린더 UI·확대 달력·모바일 상호작용·공휴일·지정 시각 예약
  정책은 변경하지 않았다.

## 8. 작업 트리 검증

`git diff --check` 출력 없음. 커밋·push·checkout은 수행하지 않았다.
