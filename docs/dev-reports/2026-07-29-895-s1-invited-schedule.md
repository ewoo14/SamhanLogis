# #895 슬라이스 1 — 초대받은 참여자 일정 조회

## 범위

- `groupware-service`의 기존 `schedules` / `schedule_participants` 조회 경로만 수정했다.
- 신규 테이블·화면·권한 체계는 추가하지 않았다.
- 신규 IT fixture는 모두 실제 `POST /admin/groupware/schedules` 경로로 생성했다.
- 신규 두 테스트는 Testcontainers PostgreSQL 기반이며 `ubuntu-latest`에서도 같은 계약을 검증한다.

## RED 원문

실패 테스트를 먼저 추가한 뒤, 운영 코드 수정 전에 아래 대상 테스트를 실행했다.

```text
> Task :services:groupware-service:test

GroupwareAdminControllerIT > find_schedules_includes_invited_participant_schedule_once() FAILED
    java.lang.AssertionError at GroupwareAdminControllerIT.java:871

2026-07-29T21:27:02.936+09:00  INFO 56788 --- [groupware-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-07-29T21:27:02.938+09:00  INFO 56788 --- [groupware-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-1 - Shutdown initiated...
2026-07-29T21:27:02.944+09:00  INFO 56788 --- [groupware-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : HikariPool-1 - Shutdown completed.

> Task :services:groupware-service:test FAILED
27 actionable tasks: 27 executed

2 tests completed, 1 failed

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':services:groupware-service:test'.
> There were failing tests. See the report at: file:///C:/dev/Samhan-Public/.claude/worktrees/t895/services/groupware-service/build/reports/tests/test/index.html

BUILD FAILED in 50s
```

Gradle HTML/XML 상세 assertion 원문:

```text
java.lang.AssertionError: JSON path "$.data.length()" expected:<1> but was:<0>
at com.samhanair.logis.groupware.it.GroupwareAdminControllerIT.find_schedules_includes_invited_participant_schedule_once(GroupwareAdminControllerIT.java:871)

find_schedules_does_not_expose_schedule_to_non_owner_or_participant() — passed
```

즉 실제 POST는 참여자 2명을 가진 일정을 201로 만들었지만, 참여자 헤더로 GET하면 기존 소유자 전용 JPQL 때문에 0건이었다. 무권한자 조회는 같은 RED 실행에서 0건으로 통과했다.

## 수정

`ScheduleRepository.findVisibleInRange`가 기간 조건과 함께 다음을 검사한다.

```text
s.ownerId = :userId
OR EXISTS active ScheduleParticipant(participantId = :userId)
```

참여자 권한 판정은 collection fetch join과 분리한 `EXISTS`로 두었다. 응답용 활성 참여자 전체는 기존 `left join fetch`로 유지하고, `select distinct s`로 복수 참여자 fetch에 따른 일정 중복을 제거한다. `p.isDeleted = false`도 쿼리에 명시했으며 엔티티의 `@SQLRestriction("is_deleted = false")`와 함께 soft-deleted 일정·참여자를 제외한다.

## GREEN / 최종 검증

대상 테스트 GREEN:

```text
BUILD SUCCESSFUL in 47s
27 actionable tasks: 27 executed
```

요청한 전체 명령의 Windows 동등 실행(`./gradlew.bat :services:groupware-service:test --rerun-tasks --no-build-cache`) 원문:

```text
> Task :shared:approval-core:processResources
> Task :shared:collab-core:processResources
> Task :shared:realtime-abstraction:processResources
> Task :services:groupware-service:processResources
> Task :services:groupware-service:processTestResources
> Task :shared:notification-publisher:compileJava
> Task :shared:notification-publisher:processResources
> Task :shared:notification-publisher:classes
> Task :shared:notification-publisher:jar
> Task :shared:user-client-abstraction:compileJava
> Task :shared:user-client-abstraction:processResources NO-SOURCE
> Task :shared:user-client-abstraction:classes
> Task :shared:user-client-abstraction:jar
> Task :shared:security:compileJava
> Task :shared:security:processResources
> Task :shared:security:classes
> Task :shared:discovery-abstraction:compileJava
> Task :shared:discovery-abstraction:processResources
> Task :shared:discovery-abstraction:classes
> Task :shared:discovery-abstraction:jar
> Task :shared:security:jar
> Task :shared:common:compileJava
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes
> Task :shared:common:jar
> Task :shared:approval-core:compileJava
> Task :shared:approval-core:classes
> Task :shared:approval-core:jar
> Task :shared:realtime-abstraction:compileJava
> Task :shared:realtime-abstraction:classes
> Task :shared:realtime-abstraction:jar
> Task :shared:collab-core:compileJava
> Task :shared:collab-core:classes
> Task :shared:collab-core:jar
> Task :services:groupware-service:compileJava
> Task :services:groupware-service:classes
> Task :services:groupware-service:compileTestJava
> Task :services:groupware-service:testClasses
> Task :services:groupware-service:test

2026-07-29T21:31:45.137+09:00  INFO 51904 --- [groupware-service] [ionShutdownHook] j.LocalContainerEntityManagerFactoryBean : Closing JPA EntityManagerFactory for persistence unit 'default'
2026-07-29T21:31:45.139+09:00  INFO 51904 --- [groupware-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : Shutdown initiated...
2026-07-29T21:31:45.144+09:00  INFO 51904 --- [groupware-service] [ionShutdownHook] com.zaxxer.hikari.HikariDataSource       : Shutdown completed.

BUILD SUCCESSFUL in 1m 27s
27 actionable tasks: 27 executed
```

결과 XML 합계: `30 suites / 229 tests / failures=0 / errors=0 / skipped=0`.
