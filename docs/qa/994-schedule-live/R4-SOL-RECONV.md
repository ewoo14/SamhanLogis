# PR #994 / Issue #895 일정관리 R4 SOL 재수렴 적대검증

## 최종 판정

- 대상 브랜치/HEAD: `feat/895-dashboard-schedule` / `8991c48362c69dd860fd55f6e9f19322ac974d6a`
- fix 비교 범위: `744661177..8991c4836`
- 판정 질문: **두 fix가 바꾼 표면 전체에서 실 사용자 경로로 재현 가능한 결함이 있는가**
- 판정: **도달 가능한 결함 4건**
  1. notification-service의 일시 실패 한 번이 대상자 알림을 영구 누락시킨다.
  2. 같은 일정을 동시에 확정하면 같은 대상자에게 중복 알림이 발행된다.
  3. 제거 후 다시 초대한 대상자에게 새 알림이 발행되지 않는다.
  4. 일정 알림을 클릭하면 존재하지 않는 `/schedules`로 이동해 인앱 404가 표시된다.
- R3 결함 1 `확정 일정 대상자 알림 경로 부재`: **해소됨**. 다만 위 신규 결함 4건이 생겼다.
- R3 결함 2 `등록자가 대상자가 아닌 상태로 목록 조회`: **해소됨**. 작성자는 사양대로 실제 대상자다.
- 잘못된 수신자: 정상 단일 요청에서는 **0건**. owner 한 명만 제외하고 다른 활성 대상자에게 UUID 단건 발행한다.
- V17 현재 실데이터 손상: **도달 결함 0건**, `deleted-only owner` 조건부 경로 1건은 **판정불가**.
- 조회 범위 및 수정·삭제 권한 확장: **도달 결함 0건**.
- KST/한국 달력: 현재 구현 경로의 UTC 누출 결함 **0건**. 일별 자정 경계와 “오늘” UI는 **판정불가**.
- 원격 Flyway 번호 충돌: groupware V16/V17, auth V90 모두 **0건**.

## 5개 독립 조사 역할

| 역할 | 조사 각도 | 판정 |
|---|---|---|
| 1 | 알림 수신자·실패·동시성·제거/재추가 | 도달 결함 4건 |
| 2 | V17 backfill·partial unique·계정 상태·실데이터 투영 | 도달 결함 0건, 조건부 판정불가 1건 |
| 3 | 작성자 자동 포함 후 조회·수정·삭제 객체 권한 | 도달 결함 0건, R3 결함 2 해소 |
| 4 | KST·`from/to`·서버/DB/JSON/클라이언트 경계 | 도달 결함 0건, 판정불가 2건 |
| 5 | 원격 branch/열린 PR의 groupware V16/V17·auth V90 | 충돌 0건 |

루트 리뷰어는 다섯 결과를 production 코드, 현재 DB의 읽기 전용 SELECT,
`git ls-remote --heads origin`, 각 원격 SHA의 `git ls-tree`와 다시 대조했다.

## R3 결함 2건 해소 판정

### R3 결함 1 — 확정 일정 대상자 알림 경로 부재

**해소됨.**

`CONFIRMED` 일정 생성·수정은 활성 participant를 순회해 owner만 제외하고,
각 대상자 UUID를 넣은 요청을 transaction `afterCommit` 뒤 전용 executor로 보낸다.
요청은 notification-service의 internal endpoint와 `NotificationCenterService.publish()`를
거쳐 `notification_center`에 저장될 수 있다.

근거:

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:149-176`
- `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationPublisherSupport.java:32-47`
- `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationPublisherDispatchExecutor.java:46-49`
- `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationPublisher.java:74-101`
- `services/notification-service/src/main/java/com/samhanair/logis/notification/web/NotificationCenterInternalController.java:30-35`
- `services/notification-service/src/main/java/com/samhanair/logis/notification/service/NotificationCenterService.java:33-40`

R3의 “발행 경로 자체가 없다”는 원인은 없어졌다. 아래 결함 1~4는 이 새 경로가
만든 별도 사용자 결함이다.

### R3 결함 2 — 등록자가 대상자가 아닌 상태로 목록 조회

**해소됨.**

- 신규 일정은 요청 목록과 무관하게 owner를 실제 participant로 먼저 추가한다.
- legacy owner-less 일정은 수정 시 owner participant를 복구한다.
- V17은 활성 일정 중 활성 owner participant가 없는 일정에 owner를 backfill한다.
- V17 적용 전 legacy 응답도 owner를 `participantIds`에 합치고 중복 제거한다.
- owner 제거 요청은 domain에서 no-op이다.

근거:

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:47-56,86-92`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/Schedule.java:139-147`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/ScheduleResponse.java:33-40`
- `services/groupware-service/src/main/resources/db/migration/V17__add_schedule_owner_as_participant.sql:19-27`

`ownerId OR active participant` 조회 조건은 남아 있지만 fix 뒤 owner는 개발책임자
확정 사양대로 실제 대상자이므로 R3의 잘못된 상태가 아니다.

## 도달 가능한 결함

## 결함 1 — 일시적 알림 발행 실패가 영구 누락으로 확정된다

### 실 사용자 경로

등록자 A가 대상자 B를 넣어 `CONFIRMED` 일정을 만들거나 DRAFT 일정을 확정하는
순간 notification-service가 일시적으로 연결 불가 또는 4xx/5xx를 반환한다.

### 재현 절차

1. A의 실제 JWT로 B를 대상자로 지정한 일정 생성 또는 확정 PUT을 보낸다.
2. 일정 transaction은 정상 commit시키고, commit 뒤 notification-service HTTP 호출만
   연결 실패 또는 4xx/5xx가 되게 한다.
3. notification-service 복구 후 같은 일정을 다시 저장한다.
4. B를 제거한 뒤 다시 대상자로 넣는 경로도 실행한다.
5. B의 알림 벨과 알림 내역을 조회한다.

### 관측된 잘못된 결과

`notification_requested_at`은 실제 HTTP 성공 전에 일정 transaction 안에서 기록되어
commit된다. publisher는 commit 뒤 단 한 번 호출되고 실패를 로그로만 남긴다.
복구 뒤 동일 수정이나 제거 후 재추가를 해도 participant는 이미 요청된 것으로 판정되므로
B의 알림은 영구히 생성되지 않는다.

### 파일:행 근거

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:149-176`
  — 실제 HTTP 성공 전 participant 요청 시각을 기록하고 afterCommit 발행을 등록한다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/ScheduleParticipant.java:60-65`
  — 요청 시각이 한 번 생기면 이후 발행을 전부 거부한다.
- `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationPublisherSupport.java:37-47`
  — commit 뒤 executor로 단발 실행한다.
- `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationPublisher.java:69-101`
  — 4xx/5xx·연결 실패를 catch하고 재시도하지 않는다.
- `services/notification-service/src/main/java/com/samhanair/logis/notification/service/NotificationCenterService.java:33-40`
  — HTTP가 실제 도달해야만 알림 행이 저장된다.

## 결함 2 — 동시 확정 요청이 같은 대상자에게 중복 알림을 만든다

### 실 사용자 경로

A가 B를 대상자로 둔 DRAFT 일정을 두 기기에서 동시에 확정하거나,
저장 버튼 중복 제출로 같은 `status=CONFIRMED` PUT 두 건을 동시에 보낸다.

### 재현 절차

1. A가 B를 대상자로 DRAFT 일정을 등록한다.
2. 같은 일정에 `status=CONFIRMED`인 PUT 두 건을 동시에 보낸다.
3. 두 transaction이 participant를 읽은 뒤 commit되게 한다.
4. B의 알림 내역에서 같은 일정 알림 수를 확인한다.

### 관측된 잘못된 결과

두 transaction은 모두 같은 participant의 `notification_requested_at=null`을 읽을 수 있다.
각 transaction은 인메모리 check-then-set을 통과하고 afterCommit 발행을 등록한다.
entity에 optimistic version이나 원자 DB compare-and-set이 없어 두 commit 모두 성공할 수 있다.
notification-service도 `(source_service, source_ref_id, channel)`을 일반 index로만 두므로
동일 일정·대상자의 알림 2행을 모두 저장한다.

### 파일:행 근거

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/controller/GroupwareAdminController.java:314-322`
  — 실제 사용자의 확정 PUT 진입점이다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:86-115,149-176`
  — 잠금 없이 조회·확정·발행 예약을 수행한다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/ScheduleParticipant.java:60-65`
  — DB 원자 조건이 아닌 인메모리 check-then-set이다.
- `shared/common/src/main/java/com/samhanair/logis/common/entity/BaseEntity.java:18-43`
  — optimistic version 필드가 없다.
- `shared/notification-publisher/src/main/java/com/samhanair/logis/notification/publisher/NotificationPublisherSupport.java:37-42`
  — 성공한 두 commit의 callback이 각각 실행된다.
- `services/notification-service/src/main/java/com/samhanair/logis/notification/service/NotificationCenterService.java:33-40`
  — 각 요청마다 새 entity를 저장한다.
- `services/notification-service/src/main/resources/db/migration/V5__create_notification.sql:41-42`
  — source-ref index는 `UNIQUE`가 아니다.

## 결함 3 — 제거 후 다시 초대한 대상자에게 새 알림이 없다

### 실 사용자 경로

B가 확정 일정의 최초 알림을 받은 뒤 A가 B를 대상자에서 제거하고,
나중에 같은 일정에 B를 다시 대상자로 초대한다.

### 재현 절차

1. A가 B를 포함한 `CONFIRMED` 일정을 등록하고 최초 알림이 B에게 발행되게 한다.
2. A가 PUT으로 B를 `participantIds`에서 제거한다.
3. 별도 PUT으로 B를 다시 `participantIds`에 추가한다.
4. B의 알림 벨과 내역을 확인한다.

### 관측된 잘못된 결과

B의 participant 행은 soft-delete되고 최초 `notification_requested_at`은 보존된다.
재초대는 같은 tombstone을 restore만 하므로 `markNotificationRequested()`가 false를
반환한다. B는 일정 조회 권한을 다시 얻지만 새 초대 알림은 0건이다.

동일 PUT 재시도와 “제거 후 별도 재초대”는 다른 사용자 사건이다. fix 보고서는 이를
중복 방지로 기록했지만, 개발책임자 확정 사양이나 이번 라운드의 추가·제거 질문에는
과거 알림을 새 초대 알림으로 간주한다는 정책이 없다.

### 파일:행 근거

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:98-115`
  — PUT 전체 교체 뒤 현재 활성 participant에 대한 발행을 판단한다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/Schedule.java:121-129`
  — tombstone 재추가는 새 행/새 사건이 아니라 기존 행 restore로 처리된다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/Schedule.java:139-147`
  — 제거 시 알림 요청 이력을 보존한다.
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/ScheduleParticipant.java:60-65`
  — 보존된 시각 때문에 재발행이 차단된다.

## 결함 4 — 일정 알림 클릭이 읽음 요청 후 인앱 404로 끝난다

### 실 사용자 경로

대상자 B가 데스크톱 상단 알림 벨을 열고 정상 발행된 `SCHEDULE` 알림 행을 클릭한다.

### 재현 절차

1. B에게 정상 발행된 일정 알림을 알림 벨에 표시한다.
2. 해당 알림 행을 클릭한다.
3. 이동한 화면을 확인한다.

### 관측된 잘못된 결과

알림 벨은 acknowledge mutation을 시작한 뒤 deeplink `/schedules`로 이동한다.
해당 Desktop route가 없으므로 catch-all `NotFoundPage`가
“페이지를 찾을 수 없습니다”를 표시한다. 사용자는 알림에서 일정을 열 수 없다.

### 파일:행 근거

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:160-176`
  — 모든 일정 알림의 deeplink를 `/schedules`로 만든다.
- `clients/desktop/src/renderer/components/NotificationBellDropdown.tsx:73-77`
  — acknowledge 요청 뒤 deeplink로 이동한다.
- `clients/desktop/src/renderer/components/NotificationBellDropdown.tsx:263-265`
  — `/schedules`를 안전한 내부 경로로 허용한다.
- `clients/desktop/src/renderer/routes/index.tsx:349-350,1716-1719`
  — `/notifications`는 있지만 `/schedules`는 없고 미등록 경로는 404로 간다.
- `clients/desktop/src/renderer/routes/NotFoundPage.tsx:49-72`
  — 실제 사용자에게 표시되는 404 결과다.

## 각도별 판정

### 1. 알림이 잘못된 사람에게 가는 경로

정상 단일 요청의 잘못된 수신자는 **0건**이다.

- `ScheduleService.java:153-169`는 활성 participant만 순회한다.
- owner UUID와 정확히 같은 participant 한 명만 건너뛰므로 다른 대상자까지 제외하지 않는다.
- 요청은 `targetRole=null`, `targetUserId=<participant UUID>`다.
- `NotificationCenterRepository.java:24-36`도 이 알림을 해당 UUID 사용자에게만 노출한다.

비대상자·역할 전체·작성자 자신에게 확장되는 경로는 확인되지 않았다. 대신 발행의
내구성·동시성·재초대·착지점에서 결함 1~4가 도달한다.

### 2. V17 backfill 실데이터 무결성

현재 공유 DB를 읽기 전용 SELECT로 분류한 결과:

```text
active schedule + owner active only          = 0
active schedule + owner deleted only         = 0
active schedule + owner active/deleted both  = 0
active schedule + owner row absent           = 25
soft-deleted schedules                       = 1
V17 SELECT 내부 중복 pair                    = 0
현재 active partial unique 충돌 후보         = 0
deleted history를 가진 V17 후보              = 0
```

따라서 현재 25건에 V17을 투영해도 partial unique 위반은 없다.

- 이미 활성 owner 행이 있으면 `NOT EXISTS`가 제외한다.
- 현재 soft-deleted owner 이력은 0건이다.
- soft-deleted 일정 1건은 `s.is_deleted=FALSE` 조건에서 제외된다.
- 일정 PK 때문에 같은 `(schedule_id, owner_id)`가 V17 SELECT 내부에서 중복되지 않는다.

근거:

- `services/groupware-service/src/main/resources/db/migration/V17__add_schedule_owner_as_participant.sql:19-27`
- `services/groupware-service/src/main/resources/db/migration/V1__init_groupware.sql:108-110,137-154`

작성자 계정 상태도 대조했다.

```text
활성 일정 25건의 distinct owner UUID = 5
auth_db accounts: ACTIVE=0, INACTIVE=0, SOFT_DELETED=0, MISSING=5
user_db employees: ACTIVE=0, INACTIVE=0, SOFT_DELETED=0, MISSING=5
활성 participant distinct UUID = 8, user_db 존재=0
```

25건은 모두 `created_by='system'`인 seed 일정이다. user FK가 없어 V17은 미존재 owner
UUID를 participant로 복제하지만, 이 UUID와 일치하는 인증 사용자가 없어 현재 일정 조회에
도달하지 않는다. owner 알림도 명시적으로 제외되고 같은 owner UUID의 participant 추가가
다른 사용자의 조회 predicate를 참으로 만들지 않는다. 따라서 이번 질문의 실 사용자
도달 결함으로 세지 않는다.

#### 조건부 판정불가 — soft-deleted owner 행이 있었다면

`deleted-only owner`가 있었다면 V17은 새 활성 owner 행을 넣어 deleted+active 두 행을
남긴다. 이후 owner의 PUT에서 순서 없는 participant collection의 `findFirst()`가 deleted
행을 먼저 선택하면 이를 restore해 활성 중복을 만들고 partial unique 위반으로 PUT이
실패할 수 있다.

근거:

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/Schedule.java:61-62,121-129`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/ScheduleParticipant.java:23-27`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java:91-92`
- `services/groupware-service/src/main/resources/db/migration/V1__init_groupware.sql:151-154`

그러나 현재 `deleted-only owner=0`이고 이 fix 뒤에는 owner 제거도 막힌다. V17 적용도
금지되어 실제 잘못된 PUT 결과를 관측하지 않았다. 따라서 결함이 아니라 **판정불가**다.

### 3. 작성자 자동 포함이 타인의 조회를 넓히는가

**도달 결함 0건.**

- 요청의 `ownerId` query parameter는 무시되고 gateway가 주입한 호출자 UUID만 조회에 사용된다
  (`GroupwareAdminController.java:304-310`).
- 조회는 `ownerId=호출자 OR active participant EXISTS`뿐이다
  (`ScheduleRepository.java:31-39`).
- owner participant 추가는 이미 owner와 같은 UUID 조건만 하나 더 참으로 만들며,
  다른 사용자의 predicate를 바꾸지 않는다.
- `select distinct s`와 correlated `EXISTS`라 owner가 두 조건에 모두 맞아도 일정이
  중복 반환되지 않는다.
- 응답 participant UUID도 `distinct()` 처리한다
  (`ScheduleResponse.java:33-40`).

### 4. 수정·삭제 권한이 넓어졌는가

**도달 결함 0건.**

- PUT은 participant 처리 전에 `schedule.ownerId == X-User-Id`를 검사한다
  (`ScheduleService.java:86-92`).
- DELETE도 같은 owner 동일성 검사 뒤에만 soft-delete한다
  (`ScheduleService.java:134-139`).
- participant 여부는 두 객체 권한 검사에 사용되지 않는다.
- 시스템 MASTER는 controller의 page permission을 통과할 수 있어도 service owner 검사를
  통과해야 한다.
- `messenger.admin`은 별도 권한이며 이 객체 검사에 영향을 주지 않는다.

`ScheduleService.addParticipant()`에는 actor 검사가 없지만 운영 controller와 다른
production 호출자가 없어 실 사용자 HTTP 경로로 도달하지 않는다.

### 5. KST 기준과 `from/to` 경계

현재 구현 경로에서 UTC가 일정 시각에 섞이는 도달 결함은 **0건**이다.

- request/response/entity는 모두 offset 없는 `LocalDateTime`이다.
- DB의 `starts_at`, `ends_at`은 `TIMESTAMP` (`timestamp without time zone`)다.
- gateway는 query의 시간 문자열을 변환하지 않는다.
- local/prod groupware JVM은 `Asia/Seoul`로 고정돼 있다.
- 현재 container도 `TZ=Asia/Seoul`, `-Duser.timezone=Asia/Seoul`, DB
  `SHOW timezone=Asia/Seoul`로 일치했다.
- 응답 envelope의 별도 `Instant timestamp`는 일정 `data.startsAt/endsAt` 변환에 관여하지 않는다.

근거:

- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/ScheduleRequest.java:28-29`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/ScheduleResponse.java:27-28`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/Schedule.java:51-55`
- `services/groupware-service/src/main/resources/db/migration/V1__init_groupware.sql:108-114`
- `services/groupware-service/src/main/java/com/samhanair/logis/groupware/repository/ScheduleRepository.java:24-35`

판정불가 2건:

1. 조회는 `endsAt >= from AND startsAt <= to`인 폐구간이다. `to=다음날 00:00`을
   일별 범위 끝으로 사용할 경우 자정 이벤트가 인접 두 범위에 포함될 수 있다.
   그러나 현재 일별 window 계약과 달력 consumer가 없어 잘못된 결과인지 판정할 수 없다.
2. server는 “오늘”을 계산하지 않고 client가 보낸 range만 사용한다.
   Desktop에는 일정 API·달력 화면·`/schedules` route가 없어 실제 한국 달력의
   오늘 경계는 판정할 수 없다.

### 6. 다른 열린 PR과 Flyway 번호 충돌

**충돌 0건.**

새 `git ls-remote --heads origin` 결과 23개 원격 head를 얻었고, 23개 SHA 전부를 다음
경로에 대해 `git ls-tree -r --name-only`로 읽었다.

- `services/groupware-service/src/main/resources/db/migration`
- `services/auth-service/src/main/resources/db/migration`

결과:

- groupware V16/V17은 `feat/895-dashboard-schedule`의 `8991c4836`에만 존재한다.
- 다른 22개 head의 groupware 최고 번호는 V15 이하이다.
- auth V90도 대상 branch에만 존재한다.
- 다른 22개 head의 auth 최고 번호는 V89 이하이다.
- 현재 열린 PR은 6개이며 대상 외 5개도 같은 결과다.
- product-service 등 다른 서비스의 V16/V17은 서비스별 Flyway history이므로
  groupware 충돌이 아니다.

따라서 현재 병합 조합에서 duplicate version으로 groupware/auth가 기동하지 않아
일정·권한 경로가 중단되는 실 사용자 결함은 없다.

파일 근거:

- `services/groupware-service/src/main/resources/db/migration/V16__add_schedule_notification_requested_at.sql:1-3`
- `services/groupware-service/src/main/resources/db/migration/V17__add_schedule_owner_as_participant.sql:1-4`
- `services/auth-service/src/main/resources/db/migration/V90__seed_groupware_schedules_page_permission.sql:1-4`

## 증거 무결성 대조

### 일치

- fix 1 문서의 `afterCommit → 전용 executor → NotificationPublisher → notification center`
  호출 사슬은 현재 production 코드와 일치한다.
- fix 1 문서의 “요청 시각을 먼저 기록하고 publisher는 fail-soft 단일 시도” 설명도
  코드와 일치한다. 이 설명 자체가 결함 1의 근거다.
- fix 2 문서의 owner 자동 participant 추가, owner 제거 방어, owner 알림 제외,
  legacy 응답 합집합은 현재 코드와 일치한다.
- PM의 V17 투영 `활성 일정 25건 전부`, 활성 participant `41 → 66`,
  active partial unique 충돌 0건이라는 수치는 현재 조건 분류와 모순되지 않는다.
- 단, 활성 25건은 모두 외부 사용자 계정과 연결되지 않은 seed 일정이다.
  “활성 일정 25건”이 “실 사용자가 접근하는 일정 25건”을 뜻하지는 않는다.

### 원격 수치 변화 — 설명 가능

fix 2 문서와 R3 문서의 당시 수치는 `원격 head 24개 / 열린 PR 7개`였지만,
R4 현재 수치는 `원격 head 23개 / 열린 PR 6개`다.

당시 목록의 `chore/827-legacy-gas-full-audit`가 PR #997로
`2026-07-30T05:54:51Z`에 병합된 뒤 원격 branch가 삭제됐다. merge commit
`1dc22645c30d...`는 현재 origin/main SHA와 일치한다. 따라서 차이는 시간 경과에 따른
원격 상태 변경이며, 이전 증거가 허위였다는 정황은 없다.

### 결함 증거의 성격

공유 notification/groupware DB write와 서비스 장애 주입은 금지돼 실제 알림 row를
새로 만들지 않았다. 결함 1~4는 모두 production endpoint에서 시작해 실제 저장/라우터
착지점까지 이어지는 코드의 결정적 상태 전이로 판정했다. live 실행 수치를 주장하지 않는다.

## 이 라운드가 보지 않은 것

- 검증 품질, 테스트 누락·강도, mock 품질은 지시대로 찾거나 보고하지 않았다.
- 이미 확인된 R2의 등록·대상자/비대상자 조회·권한 HTTP 결과와 CI 42/42는 반복하지 않았다.
- 기존 `GET /schedules/{id}` 405→500은 fix 표면이 아니므로 재조사·재보고하지 않았다.
- V17을 실제 적용하지 않았고 Docker stack을 재배포·중단하지 않았다.
- 공유 groupware/notification/auth/user 데이터에는 write하지 않았다.
- 서비스 장애 주입, 동시 PUT 실데이터 생성, 알림 click용 live fixture 생성은 수행하지 않았다.
- 아직 구현되지 않은 일정 달력 UI·확대 달력·모바일 상호작용·공휴일 표시는
  실제 소비 경로가 없어 판정하지 않았다.
- gateway를 우회한 groupware-service 직접 접근 가능성은 이 두 fix가 만든 표면이 아니므로
  조사하지 않았다.
- 코드·handoff 문서·git index/ref/history는 변경하지 않았다.
