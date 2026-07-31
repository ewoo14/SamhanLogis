# PR #994 (#895 일정관리) 범위 축소 — 알림 발행 후속 이월

작성일: 2026-07-30  
브랜치: `feat/895-dashboard-schedule`  
기준 HEAD: `b02971459`

## 1. PM 결정과 결론

R4 재수렴에서 결함 4건이 모두 `CONFIRMED` 일정 알림 발행 경로에서 발생했다.

```text
수렴비 c = 4/2 = 2.00 (목표 <0.45)
fix-유발률 r = 4/4 = 1.00
```

따라서 알림 재시도·outbox·멱등키·재초대 정책을 이 라운드에서 추가하지 않았다.
알림 발행 표면 자체를 PR #994에서 제거하고, 캘린더 UI가 존재하는 후속 슬라이스로
이월했다. 알림 사양을 폐기한 것이 아니라 UI와 end-to-end로 함께 검증할 수 있도록
경계를 다시 그은 것이다.

R4가 확인한 결함은 다음과 같다.

1. notification-service 일시 실패가 대상자 알림 영구 누락으로 이어짐
2. 동시에 확정하면 같은 대상자에게 중복 알림이 발행됨
3. 제거 후 재초대하면 새 알림이 발행되지 않음
4. 알림 클릭 목적지 `/schedules`가 없어 인앱 404가 됨

## 2. 남긴 것

- `groupware.schedules` page-code 등록, auth-service `V90` seed, `PageCode` 및
  데스크톱 권한 catalog/matrix 등재
- 일정 등록·조회·수정·삭제 API와 owner 검사
- `ScheduleService`의 작성자 자동 participant 포함, owner 제거 방어,
  legacy owner-less 응답 합집합, `V17` backfill
- 등록자 본인 수정·삭제와 비대상자 비노출 계약
- 정찰·기획·라이브QA·R4 적대검증 산출물과 owner 자동 대상자 보고서
- 기존 메신저 `MessageService` 및 공통 notification publisher 동작

작성자 자동 대상자 fix는 되돌리지 않았다. 작성자는 생성 시 항상 participant로 들어가며,
수정 시 owner-less legacy 행을 복구하고, owner 제거 요청은 domain에서 무시한다.

## 3. 뺀 것

- `ScheduleService`의 `CONFIRMED` 대상자 순회 및 `afterCommit` 예약
- 일정 전용 `NotificationPublishRequest`, `NotificationPublisherSupport` 호출,
  일정 전용 executor 주입 및 `/schedules` deeplink 생성
- `ScheduleParticipant.notificationRequestedAt`과 `markNotificationRequested()`
- 일정 전용 알림 테스트 5개와 publisher/executor mock
- 데스크톱 `CHANNEL_LABEL.SCHEDULE`
- 폐기된 구현을 완료된 것으로 기술하던
  `docs/dev-reports/2026-07-30-895-schedule-notification-fix.md`

공통 `NotificationPublisher`, `NotificationPublisherSupport`,
`NotificationPublisherDispatchExecutor`는 `MessageService`와 다른 서비스가 사용하므로
삭제하지 않았다. 이 PR에서 제거한 것은 일정 알림 호출자와 일정 전용 상태뿐이다.

## 4. 결함 1~4 재현 시도 결과

공유 groupware/notification 데이터 write, 공유 Docker 재배포, V17의 공유 DB 적용은
하지 않았다. 대신 동일한 service mutation 경로를 단위 테스트로 확인하고, 격리된
Testcontainers PostgreSQL 전체 테스트로 Flyway/JPA/API 경계를 확인했다.

### 결함 1 — 일시 실패 후 영구 누락

R4 절차(생성 또는 확정 → notification-service 실패 → 일정 재저장 → 제거 → 재초대 →
알림 벨/내역 조회)를 적용할 수 있는 일정 service 호출을 확인했다. 결과는
`ScheduleServiceTest.create_confirmed_schedule_does_not_register_notification_callback`
에서 확정 일정 생성 뒤 transaction synchronization이 0건이었다. 따라서 HTTP 발행,
실패 기록, 발행 요청 시각 선기록, 복구 후 재시도 여부를 판단하는 일정 알림 상태가
더 이상 존재하지 않는다. 이 경로에서 대상자 알림 누락은 발생하지 않는다.

실제 사용자 JWT와 공유 알림 내역 조회는 공유 write 금지 때문에 수행하지 않았으며,
그 대신 발행 호출자·상태·callback의 production 참조를 0건으로 대조했다.

### 결함 2 — 동시 확정 중복

R4 절차(대상자 B를 둔 DRAFT 생성 → 동일 일정에 CONFIRMED PUT 2건 동시 제출 →
commit → B 내역의 동일 알림 수 확인)를 적용하면 두 PUT은 일정/participant 변경만
수행하고 publisher callback을 등록하지 않는다. 따라서 두 transaction이 동시에
읽더라도 알림 요청이 2건으로 분기할 지점이 없다. 공유 실데이터 동시 PUT은 금지되어
수행하지 않았고, 동일 조건의 단위 경로에서 callback 0건을 확인했다.

### 결함 3 — 제거 후 재초대 미발행

R4 절차(확정 일정 최초 대상자 → PUT으로 제거 → 별도 PUT으로 재추가 → 벨/내역 확인)를
적용하면 participant restore는 기존 일정 대상자 semantics로 남지만 알림 발행은 하지
않는다. `notification_requested_at` 선기록/보존으로 재발행을 막던 상태는 Java entity에서
제거했고, 전용 컬럼은 신규 `V18`에서 삭제한다. 그러므로 “새 알림이 누락되는” 경로가
이번 PR에는 없다. 제거·재초대의 알림 의미는 후속 슬라이스에서 새 사건으로 확정해야 한다.

### 결함 4 — 클릭 후 `/schedules` 404

R4 절차(정상 일정 알림을 벨에 표시 → 행 클릭 → 화면 확인)를 적용할 알림 행을 이
PR의 일정 API가 더 이상 만들 수 없다. 따라서 알림 클릭에서 `/schedules`로 이동하는
사용자 경로가 없다. `/schedules` UI route 자체는 캘린더 UI 후속 범위이므로 만들지
않았고, 직접 주소를 여는 기존 미등록 경로의 404를 이번 PR에서 숨기지 않았다.

## 5. 불변식 6개 확인표

| 불변식 | 확인 방법과 결과 |
|---|---|
| 1. 결함 1~4 실 사용자 경로 부재 | `ScheduleService`에서 publisher/import/afterCommit/deeplink 호출을 제거하고, 확정 생성 callback 0건 테스트 및 production stale 참조 0건을 확인했다. |
| 2. 작성자 자동 대상자 포함 | 기존 `create_includes_owner_in_response_participants`, legacy 응답, owner 제거 방어 테스트와 `V17` migration IT를 보존했다. 전체 PostgreSQL 테스트에서도 통과했다. |
| 3. 라이브QA 계약 유지 | controller/repository/response/owner 권한 코드를 알림 제거 외에는 변경하지 않았다. 기존 라이브QA의 201, 대상자/비대상자 조회, 타인 PUT/DELETE 403, 본인 PUT/DELETE PASS 및 권한 화면 결과를 보존했다. |
| 4. 메신저 동작 불변 | `MessageService` 및 메신저 테스트는 수정하지 않았다. 공통 publisher는 메신저 경로에 남아 있고 groupware 전체 테스트 237건이 모두 통과했다. |
| 5. 죽은 코드 없음 | 일정 publisher 호출자, 일정 상태 field/method, 일정 알림 테스트, `SCHEDULE` 라벨을 제거했다. 공통 publisher/executor는 다른 실제 호출자가 있어 유지했다. |
| 6. 멱등·실패 시 부분 반영 없음 | 알림 외부 side effect와 전용 상태 기록을 제거했다. participant 추가의 domain idempotent, owner 제거 방어, `@Transactional` 일정 mutation과 기존 권한 검사를 유지했다. |

## 6. 마이그레이션 처리 판단

`V16__add_schedule_notification_requested_at.sql`은 일정 알림 전용 컬럼이지만 이미 번호를
점유했으므로 수정·삭제하지 않았다. `V17__add_schedule_owner_as_participant.sql`은
작성자 자동 대상자 계약을 구현하는 핵심 migration이므로 그대로 유지한다.

컬럼을 남기면 발행 경로가 없어도 알림 이력처럼 보이는 dead schema가 남는다. 다른
production 참조가 없고 손실되는 값도 폐기된 알림 요청 시각뿐이므로, 신규
`V18__remove_schedule_notification_state.sql`에서 `DROP COLUMN IF EXISTS`로 정리했다.
V16/V17 파일 자체는 변경하지 않았다. auth `V90`은 권한 seed라 알림 전용이 아니므로
유지한다.

번호 대조 결과 현재 branch는 groupware V16/V17을 점유하고, 원격 다른 branch 최고는
V15였다. 따라서 V18을 선택했다. 공유 DB에는 V17/V18을 수동 적용하지 않았다.
전체 테스트는 격리 Testcontainers PostgreSQL에서만 실행되며, 테스트 종료 시 스키마가
제거된다.

## 7. 다음 슬라이스의 경계 — UI와 함께 알림 재도입 시 선행 조건

다음 순서로 갖춰야 한다.

1. 클릭 목적지 `/schedules` route와 일정 단건 조회/권한 검사를 먼저 구현하고,
   `sourceRefId`가 실제 일정 화면으로 해석되는지 확인한다.
2. 발행 계약을 `sourceService + sourceRefId + channel + targetUserId` 기준의 명시적인
   idempotency key로 확정하고, notification 저장소의 unique 제약과 동시 확정 테스트를
   먼저 마련한다.
3. 일정 commit과 발행 요청을 분리하는 durable outbox 또는 동등한 재시도 상태를
   마련한다. notification-service 일시 실패가 일정 transaction 안의 “발행 요청 완료”
   상태로 잘못 확정되지 않아야 한다.
4. 제거→재초대가 “과거 발행의 재시도”인지 “새 초대 사건”인지 정책을 결정하고,
   tombstone restore와 새 사건 key를 포함한 테스트를 추가한다.
5. 위 네 조건을 갖춘 뒤에만 `CONFIRMED` 발행을 붙이고, 일정 등록·확정·동시 확정·실패
   복구·제거·재초대·알림 클릭을 한 번의 end-to-end QA로 검증한다.

## 8. 검증 원문

### groupware-service 단위 회귀

```powershell
$env:GRADLE_USER_HOME = 'D:\dev\Samhan-Public\.gradle-t26'
.\gradlew :services:groupware-service:test `
  --tests 'com.samhanair.logis.groupware.service.ScheduleServiceTest' `
  --rerun-tasks --no-daemon --console=plain
```

```text
BUILD SUCCESSFUL in 2m 29s
27 actionable tasks: 27 executed
```

### groupware-service 전체 — 격리 실 PostgreSQL 포함

```powershell
$env:GRADLE_USER_HOME = 'D:\dev\Samhan-Public\.gradle-t26'
.\gradlew :services:groupware-service:test --rerun-tasks --no-daemon --console=plain
```

```text
> Task :services:groupware-service:test
BUILD SUCCESSFUL in 3m 26s
27 actionable tasks: 27 executed
xml_files=32 tests=237 failures=0 errors=0 skipped=0
```

`--rerun-tasks`로 실행했으므로 `UP-TO-DATE`/`FROM-CACHE`가 아니다. Testcontainers의
격리 PostgreSQL만 사용했고, Docker 공유 stack 재배포와 공유 실데이터 write는 하지
않았다.

### 데스크톱 TypeScript

`npm run typecheck`의 real-QA 보조 단계는 180초 timeout이었으나 코드 오류 원문은
출력되지 않았다. 제가 시작한 보조 프로세스를 정리한 뒤 실제 컴파일 단계를 직접
실행했고 두 명령 모두 exit code 0이었다.

```powershell
.\node_modules\.bin\tsc.cmd -p tsconfig.node.json --noEmit
.\node_modules\.bin\tsc.cmd -p tsconfig.web.json --noEmit
```

## 9. 변경·신규 파일과 diff 수

최종 작업 트리의 `git diff --numstat` 및 신규 파일 `--no-index` 기준이다.
삭제된 기존 fix 보고서는 `git diff` 삭제 수에 포함한다.

### 기존 파일 변경/삭제

| 파일 | +N | −M | 내용 |
|---|---:|---:|---|
| `clients/desktop/src/renderer/api/notificationApi.ts` | +0 | −1 | 일정 알림 라벨 제거 |
| `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/ScheduleParticipant.java` | +0 | −17 | 알림 요청 상태 제거 |
| `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java` | +0 | −58 | 일정 알림 발행 경로 제거 |
| `services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/ScheduleServiceTest.java` | +5 | −192 | 알림 발행 테스트 제거, callback 부재 guard 유지 |
| `docs/dev-reports/2026-07-30-895-schedule-notification-fix.md` | +0 | −183 | 폐기된 fix 보고서 삭제 |

### 신규 파일

| 파일 | +N | −M | 내용 |
|---|---:|---:|---|
| `services/groupware-service/src/main/resources/db/migration/V18__remove_schedule_notification_state.sql` | +3 | −0 | 전용 컬럼 신규 migration 정리 |
| `docs/dev-reports/2026-07-30-895-scope-reduction-defer-notification.md` | +226 | −0 | 본 범위 축소·검증 보고서 |

## 10. PM 대조용 전체 작업 트리 목록

아래가 이 세션에서 PM에게 남기는 `git status --porcelain --untracked-files=all` 전체다.
commit/add/push/checkout은 수행하지 않았다.

```text
 M clients/desktop/src/renderer/api/notificationApi.ts
 D docs/dev-reports/2026-07-30-895-schedule-notification-fix.md
 M services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/ScheduleParticipant.java
 M services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java
 M services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/ScheduleServiceTest.java
?? docs/dev-reports/2026-07-30-895-scope-reduction-defer-notification.md
?? services/groupware-service/src/main/resources/db/migration/V18__remove_schedule_notification_state.sql
```

그 밖의 page-code, V90, owner 자동 대상자, API/권한, 기존 QA·계획 산출물 파일은
현재 HEAD에 남아 있으며 이번 작업 트리에서 수정하지 않았다.
