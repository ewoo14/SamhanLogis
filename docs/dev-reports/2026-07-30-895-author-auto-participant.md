# PR #994 (#895 일정관리) 후속 fix — 등록자 자동 대상자

작성일: 2026-07-30  
브랜치: `feat/895-dashboard-schedule`  
기준 HEAD: `c91376cab`  
범위: 일정 등록자를 자동 대상자로 포함하고, 기존 owner-less 일정과 확정 일정 알림을 같은 계약으로 정렬

## 1. 개발책임자 확정 사양

> “작성자는 당연히 일정에 포함이 되어야지… **자동 권한**인거니까”

이번 fix는 위 사양을 기준으로 다음 결과를 보장한다.

- 작성자는 본인이 등록한 일정의 대상자 목록에 항상 포함된다.
- 요청의 `participantIds`에서 작성자를 빼도 작성자 행은 제거되지 않는다.
- 기존 일정은 owner participant 행이 없었어도 작성자가 계속 조회할 수 있다.
- 작성자를 대상자에 추가해도 접근 권한이 작성자/대상자 외 사용자에게 확장되지 않는다.
- 수정·삭제 객체 권한은 계속 일정 등록자만 가진다.
- `CONFIRMED` 알림은 다른 대상자에게만 발행하고 작성자 자신에게는 발행하지 않는다.
- 참여자 추가·제거와 같은 요청 반복은 중복 행·중복 알림으로 수렴하지 않는다.

## 2. 원인

기존 `ScheduleRepository.findVisibleInRange()`는 이미 `s.ownerId = :userId OR active participant`로 작성자 조회를 허용했다. 하지만 `ScheduleService.create()`는 요청의 `participantIds`만 `schedule_participants`에 저장했고, `ScheduleResponse.from()`도 그 행만 응답했다.

그 결과 작성자는 조회 권한만 있고 대상자 집합에는 없었다. 직전 알림 fix의 `publishPendingNotifications()`도 `schedule.getParticipantsView()`만 순회하므로 작성자에게는 알림이 발행되지 않는 것이 아니라, 작성자가 대상자에서 누락된 상태였다. 이 상태는 알림 외에 대상자 집합을 사용하는 후속 기능도 작성자를 빠뜨린다.

## 3. RED-first 원문

수정 전에 실제 `ScheduleService.create()`와 기존 `afterCommit → 전용 executor → NotificationPublisher` 경로를 호출하는 테스트 두 건을 추가했다.

실행 명령:

```powershell
$env:GRADLE_USER_HOME = 'D:\dev\Samhan-Public\.gradle-t20'
.\gradlew :services:groupware-service:test `
  --tests 'com.samhanair.logis.groupware.service.ScheduleServiceTest.create_includes_owner_in_response_participants' `
  --tests 'com.samhanair.logis.groupware.service.ScheduleServiceTest.create_confirmed_schedule_does_not_notify_owner_but_notifies_other_participant' `
  --rerun-tasks --no-daemon --console=plain
```

원문:

```text
> Task :services:groupware-service:test

ScheduleServiceTest > create_includes_owner_in_response_participants() FAILED
    java.lang.AssertionError at ScheduleServiceTest.java:116

ScheduleServiceTest > create_confirmed_schedule_does_not_notify_owner_but_notifies_other_participant() FAILED
    org.mockito.exceptions.verification.TooManyActualInvocations at ScheduleServiceTest.java:148

2 tests completed, 2 failed

> Task :services:groupware-service:test FAILED
27 actionable tasks: 27 executed
BUILD FAILED
```

첫 실패는 응답 `participantIds`에 owner가 없다는 증거다. 둘째 실패는 요청에 owner를 명시적으로 포함해도 작성자 알림까지 발행되어 총 호출 수가 2건이 된다는 증거다.

## 4. fix

- `ScheduleService.create()`에서 요청 목록과 관계없이 `ownerId`를 먼저 `schedule.addParticipant()`한다.
- `update()`와 `addParticipant()`도 기존 owner-less 행을 만나면 owner를 복구한다.
- `Schedule.removeParticipant()`는 `ownerId` 제거 요청을 no-op으로 처리한다. 따라서 수정 요청에서 owner를 빼도 자동 권한이 사라지지 않는다.
- `publishPendingNotifications()`는 참여자 행에 owner가 있어도 owner 대상은 건너뛴다. 다른 참여자에게는 기존 `afterCommit` 전용 executor 발행 경로를 그대로 사용한다.
- `ScheduleResponse.from()`은 legacy owner-less 행을 읽는 동안에도 `ownerId`를 응답 목록에 합치고 `distinct()`한다. V17 적용 전 읽기에도 응답 계약이 유지된다.
- `GroupwareSeeder`는 seed 일정마다 owner를 명시적으로 추가한다. seed 일정은 기존 5건 + 참여자 10건에서 등록자 포함 15건이 된다.
- V16 뒤 V17 migration이 활성 일정 중 owner participant가 없는 행에만 owner 행을 backfill한다. 이미 활성 owner 행이 있으면 다시 넣지 않는다. soft-deleted owner 행만 있는 경우에는 활성 행을 새로 만든다.
- 수정·삭제의 등록자 검사 코드는 변경하지 않았다.

## 5. GREEN 원문

### 5-1. 일정 service 회귀

```text
> Task :services:groupware-service:test

BUILD SUCCESSFUL in 37s
27 actionable tasks: 27 executed
```

대상: `ScheduleServiceTest` 전체. owner 자동 포함, owner self-notification 제외, owner 제거 방어, 기존 확정 일정의 신규 참여자 1회 발행을 포함한다.

### 5-2. 기존 owner-less 조회 실제 JPA 경로

공유 DB가 아닌 H2 격리 DB에서 `Schedule.create()`로 기존 GroupwareSeeder와 같은 owner-less 일정을 repository에 저장하고 실제 `ScheduleRepository.findVisibleInRange()` JPQL을 실행했다.

```text
> Task :services:groupware-service:test

BUILD SUCCESSFUL in 45s
27 actionable tasks: 27 executed
```

검증 결과:

- owner 조회: 일정 1건 반환
- owner가 아닌 outsider 조회: 0건
- Hibernate `create-drop` 종료 시 H2 테이블만 제거됨

### 5-3. groupware-service 비-IT 전체

```text
> Task :services:groupware-service:test

BUILD SUCCESSFUL in 51s
27 actionable tasks: 27 executed
```

테스트 XML 실측:

```text
xml_files=19 tests=106 failed_or_errors=0 skipped=0
```

`--rerun-tasks`를 사용했으므로 `UP-TO-DATE`/`FROM-CACHE`로 빠진 task는 없다.

## 6. 불변식 7개 확인표

| 불변식 | 확인 방법과 결과 |
|---|---|
| 1. 작성자는 자기 일정의 대상자이며 응답 목록에 포함 | `ScheduleServiceTest.create_includes_owner_in_response_participants()`가 실제 create 경로의 응답 변환에서 owner + 다른 참여자를 확인했다. `response_includes_owner_for_legacy_ownerless_schedule()`는 participant 행이 없는 legacy domain object도 응답에 owner를 포함하는지 확인했다. 두 테스트 모두 GREEN이다. |
| 2. 기존 일정도 작성자가 계속 조회 | `ScheduleRepositoryTest.owner_can_still_query_legacy_ownerless_schedule_but_outsider_cannot()`가 owner-less 일정 저장 후 실제 repository query로 owner 1건을 확인했다. PostgreSQL upgrade 경로는 `ScheduleOwnerParticipantMigrationIT.v17_backfills_owner_as_active_participant_for_legacy_schedule()`를 추가해 V16 schema → legacy row → V17 backfill을 검증하도록 했다. 이 IT는 Docker 금지 때문에 이번 세션에는 실행하지 않았고 compileTestJava에만 포함됐다. |
| 3. 작성자를 대상자에서 제거 불가 | `ScheduleServiceTest.owner_cannot_be_removed_from_schedule_participants()`가 owner 제거 요청 후 owner 활성 행 보존을 확인했다. `update()`의 전체 교체 경로도 도메인 guard를 통과하므로 요청 목록에서 owner가 빠져도 제거되지 않는다. |
| 4. 타인의 접근 범위를 넓히지 않음 | H2 실제 repository 테스트에서 owner-less 일정은 owner에게만 반환되고 outsider에게 0건이었다. 기존 repository의 `ownerId OR active participant` 조건은 변경하지 않았다. |
| 5. 수정·삭제는 등록자만 | `ScheduleService.update()`의 owner 검사와 `delete()`의 owner 검사는 변경하지 않았다. 기존 `GroupwareAdminControllerIT.update_schedule_for_other_owner_returns_403_and_does_not_mutate()` 및 `non_owner_cannot_delete_schedule_even_when_messenger_admin_permission_is_granted()` 경로를 보존했다. 해당 Testcontainers IT는 Docker 금지로 이번 세션에 실행하지 않았다. |
| 6. 작성자 자신에게는 알림 미발행, 다른 대상자에게는 발행 | `ScheduleServiceTest.create_confirmed_schedule_does_not_notify_owner_but_notifies_other_participant()`가 owner + 다른 참여자를 요청하고 afterCommit callback을 실행한 뒤 publisher 호출이 다른 참여자 1건뿐임을 확인했다. RED에서 owner 포함으로 2건이었고 GREEN에서 1건으로 수렴했다. |
| 7. 나중 추가·제거와 반복 요청이 같은 결과 | 기존 `update_confirmed_schedule_publishes_only_new_participant_once()`가 기존 참여자·신규 참여자 추가, 신규 참여자 제거, 재추가를 순서대로 실행해 신규 알림 총 1건을 확인한다. `Schedule.addParticipant()`의 기존 idempotent 동작과 owner 복구 호출을 유지했고, owner 제거 guard를 추가했다. |

## 7. migration 번호 전수 대조

migration이 필요하므로 번호 선택 전에 다음을 실행했다.

```powershell
git fetch --all --prune
git ls-remote --heads origin
git ls-tree --name-only origin/<branch> services/groupware-service/src/main/resources/db/migration/
```

원격 열린 브랜치 24개를 `git ls-tree -r --name-only`로도 대조한 결과는 다음과 같다. 현재 작업 브랜치만 V16이며, 다른 브랜치 최고 번호는 V15 이하이므로 신규 번호는 V17이다.

```text
chore/827-legacy-gas-full-audit                  V15
chore/arologis-ci-drop-unused-jar               V9
chore/qa-harness-hash-router-nav                V14
docs/financial-integration-research             V9
feat/895-dashboard-schedule                     V16
feat/896-s4-quantity-sync-config                V15
feat/903-template-authoring-mode                V15
feat/910-client-version-policy                  V15
feat/976-gas-live-price-reflection              V15
fix/ecount-import-model-code-merge              V15
fix/monthend-detail-price-variant               V15
main                                            V15
wip/824-r1-fix-incomplete-2026-07-22           V13
wip/896-s2-r4-fix-incomplete                    V14
wip/914-luna-partial-2026-07-23                V14
wip/924-sonnet-write-blank-partial              V14
wip/937-fix7-history-total-domain               V14
wip/965-imgvalid-uncommitted-2026-07-28         V15
wip/965-warning-redesign-incomplete             V15
wip/984-r4-product-lineage-unverified           V15
wip/985-r4-price-base-parity-unverified         V15
wip/992-partner-register-partial-2026-07-29     V15
wip/ds3a-2026-07-21-evening                     V12
wip/ob863-2026-07-21-evening                    V11
```

추가 파일: `V17__add_schedule_owner_as_participant.sql`

## 8. 검증 범위와 미실행

- Gradle은 `GRADLE_USER_HOME=D:\dev\Samhan-Public\.gradle-t20`과 `:services:groupware-service:test` 범위만 사용했다.
- `--rerun-tasks --no-daemon --console=plain`으로 실행했다.
- Docker/Testcontainers는 실행하지 않았다. 따라서 PostgreSQL V17 migration IT와 PostgreSQL 기반 controller IT는 코드 컴파일만 확인했고, 실제 PostgreSQL 실행은 CI에서 확인해야 한다.
- H2 repository test는 격리 메모리 DB에서 실행했고 공유 실데이터에 write하지 않았다.
- `GET /schedules/{id}` 405→500, 캘린더 UI·확대 달력·모바일 상호작용·공휴일·알림 지정 시각 정책은 변경하지 않았다.
- git add/commit/push/checkout은 수행하지 않았다. 파일만 남겼다.

## 9. 변경 파일 및 diff 수

`git diff --numstat` 기준 tracked 파일:

| 파일 | 추가 | 삭제 |
|---|---:|---:|
| `services/groupware-service/src/main/java/com/samhanair/logis/groupware/domain/Schedule.java` | +3 | -0 |
| `services/groupware-service/src/main/java/com/samhanair/logis/groupware/dto/ScheduleResponse.java` | +6 | -3 |
| `services/groupware-service/src/main/java/com/samhanair/logis/groupware/seed/GroupwareSeeder.java` | +2 | -1 |
| `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java` | +7 | -0 |
| `services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/GroupwareAdminControllerIT.java` | +2 | -2 |
| `services/groupware-service/src/test/java/com/samhanair/logis/groupware/service/ScheduleServiceTest.java` | +76 | -0 |

신규 파일은 git이 아직 추적하지 않으므로 `git diff --numstat`에 자동 포함되지 않는다. `git diff --no-index --numstat NUL <file>`로 확인한 신규 목록은 다음과 같다.

| 신규 파일 | 추가 | 삭제 |
|---|---:|---:|
| `docs/dev-reports/2026-07-30-895-author-auto-participant.md` | +210 | -0 |
| `services/groupware-service/src/main/resources/db/migration/V17__add_schedule_owner_as_participant.sql` | +27 | -0 |
| `services/groupware-service/src/test/java/com/samhanair/logis/groupware/migration/ScheduleOwnerParticipantMigrationIT.java` | +77 | -0 |
| `services/groupware-service/src/test/java/com/samhanair/logis/groupware/repository/ScheduleRepositoryTest.java` | +42 | -0 |

`git diff --check` 출력은 없었다.

## 10. 상태

**DONE_WITH_CONCERNS**

코드·응답·owner 알림 제외·H2 실제 조회·비-IT 전체 회귀는 GREEN이다. 단, 개발책임자의 Docker 금지 지시 때문에 V17 migration의 실제 PostgreSQL 적용과 Testcontainers controller 권한 IT는 이 세션에서 실행하지 않았다. CI에서 `ScheduleOwnerParticipantMigrationIT`와 기존 일정 controller IT가 통과하는 것을 최종 확인해야 한다.
