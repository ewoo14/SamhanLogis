# #1039 가배차 권한 계약 수정 (R16)

- 조사 일자: 2026-08-04
- 대상: PR #1045 / 이슈 #1039 가배차
- 기준 워크트리 HEAD: `b4e7cffd4` (사용자 제공값, git 명령으로 재확인하지 않음)
- 담당: fix
- 작업 원칙: RED-first, MANAGER 허용과 ACCOUNTANT/DRIVER 거부 및 독립 로그인 보존을 양방향으로 검증
- 변경 제한: `services/api-gateway/**`, `services/slip-service/**`, `services/accounting-service/**`, `services/inventory-service/**`, 지정 클라이언트 파일 수정 금지; DB 쓰기·시드 변경·Docker 이미지 빌드·재배포·컨테이너 중지·전체 테스트 스위트·git 명령 금지

## 작업 시작

- R15 진단 보고서 `docs/dev-reports/2026-08-04-1039-r15-403-diagnosis.md`를 먼저 읽었다.
- R15가 확정한 원인은 Samhan 게이트웨이가 `X-User-Role`을 전달하지 않는 C5-4 계약과, arologis-service가 `enforcement-mode: role`에서 해당 헤더를 계속 요구하는 계약 불일치다.
- `enforcement-mode: role` 설정과 `AROLOGIS_*` 독립 로그인 경로는 보존해야 한다.
- 이 보고서는 각 단계 완료 직후 결과 원문을 축약하지 않고 append한다.

## 진행 상태

- [x] 영향 코드/테스트 경로 확인
- [x] RED-A/B/C 실패 원문 기록
- [x] 최소 수정 구현
- [x] GREEN-A/B/C 원문 기록
- [x] 관련 모듈 테스트와 제한된 코드 경로 재현 검증
- [x] 이 라운드가 보지 않은 것 기록

## 이 라운드가 보지 않은 것

- 아직 수정 코드와 회귀 테스트를 작성하지 않았다.
- 아직 RED/GREEN 테스트를 실행하지 않았다.
- 아직 fresh 실 브라우저 세션, Docker 재배포, DB 쓰기, 권한 시드 변경을 수행하지 않았다.

## 영향 경로 확인 완료

- `shared/security/.../PermissionAspect.java`의 현재 분기는 `roleBasedEnforcement=true`이면 항상 `X-User-Role`을 읽어 `canView/canEdit`를 호출하고, role이 없으면 `UNKNOWN`으로 거부한다.
- `services/arologis-service/.../ArologisJwtFilter.java`는 검증된 아로로지스 자체 JWT의 `role` claim을 `X-User-Role`로 주입하고 `ROLE_AROLOGIS_*` authority를 SecurityContext에 적재한다.
- `services/arologis-service/.../HeaderAuthenticationFilter.java`는 게이트웨이 경유 요청의 `X-User-Id`와 `X-User-Groups`를 인증으로 바꾸며 role은 authority로 사용하지 않는다.
- 따라서 두 진입 경로는 자체 JWT filter가 검증 후 주입한 non-blank `X-User-Role` 경로와, role 없이 `X-User-Id`/`X-User-Groups`만 가진 게이트웨이 경로로 구분할 수 있다. 게이트웨이의 `X-User-Role`을 복구하지 않는다.
- `DynamicPermissionClient.check(UUID, page, action)`은 auth-service의 account_page_permissions effective cache를 읽는다. 이 cache는 account group 권한의 OR 결과이며, MASTER는 시스템 마스터 bypass 때문에 row가 없고 `X-Is-System-Master=true`가 먼저 bypass한다.

### Root cause hypothesis

`roleBasedEnforcement`가 arologis 독립 JWT와 Samhan 게이트웨이 직원 요청을 구분하지 않고 모든 요청을 role 경로로 보내는 것이 수정 대상이다. arologis-service 내부에서 자체 JWT filter가 주입한 non-blank `X-User-Role`이 있는 요청만 기존 role 경로를 사용하고, role이 없는 게이트웨이 identity 요청은 `X-User-Id` 기반 account/group 경로로 보내면 A/B/C/D/E를 동시에 만족한다.

### 금지 범위 확인

- 수정 대상 후보는 `shared/security` 및 `arologis-service` 테스트/문서로 한정한다.
- `services/api-gateway/**`, `services/slip-service/**`, `services/accounting-service/**`, `services/inventory-service/**`, 지정된 desktop 파일은 수정하지 않는다.
- 시드와 `services/arologis-service/src/main/resources/application.yml`의 `enforcement-mode: role`은 유지한다.

## RED 원문

### RED 테스트 작성

- `shared/security/src/test/java/com/samhanair/logis/security/permission/PermissionAspectTest.java`에 RED-A/B/C를 추가했다.
- RED-A/B는 게이트웨이 헤더(`X-User-Id`, `X-User-Groups`, role 없음)로 account permission client 경로와 MANAGER 허용/ACCOUNTANT 거부를 검증한다.
- RED-C는 검증된 독립 아로로지스 JWT를 나타내는 `ROLE_AROLOGIS_MANAGER` authority와 `X-User-Role`로 기존 role permission 경로를 검증한다.

### RED 실행 원문

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon.
Daemon will be stopped at the end of the build 
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:security:compileTestJava
> Task :shared:security:processTestResources NO-SOURCE
> Task :shared:security:testClasses

> Task :shared:security:test

PermissionAspect account 권한 테스트 > RED-B: 게이트웨이 ACCOUNTANT는 account 권한 false로 가배차 VIEW 거부 FAILED
    java.lang.AssertionError at PermissionAspectTest.java:360

PermissionAspect account 권한 테스트 > RED-A: 게이트웨이 MANAGER는 role 없이 account 권한으로 가배차 VIEW 허용 FAILED
    org.springframework.security.access.AccessDeniedException at PermissionAspectTest.java:337

> Task :shared:security:test FAILED
4 actionable tasks: 2 executed, 2 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended

25 tests completed, 2 failed

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':shared:security:test'.
> There were failing tests. See the report at: file:///D:/dev/Samhan-Public/.claude/worktrees/w1045/shared/security/build/reports/tests/test/index.html

* Try:
> Run with --scan to get full insights.

BUILD FAILED in 18s
```

- RED-A/B가 현재 `roleBasedEnforcement`의 무조건 role 경로를 증명했다.
- RED-C는 기존 독립 role 경로가 이미 통과했으며, 수정 후에도 같은 경로를 유지해야 한다.

## 최소 수정 완료

- `shared/security/src/main/java/com/samhanair/logis/security/permission/PermissionAspect.java`만 인가 분기를 수정했다.
- 자체 JWT filter가 검증 후 주입한 non-blank `X-User-Role`이 있으면 아로로지스 독립 JWT 경로로 판단하여 기존 `role_page_permissions` 기반 `canView/canEdit`를 사용한다.
- role 헤더가 없으면 `roleBasedEnforcement=true`인 arologis-service에서도 `X-User-Id`를 UUID로 파싱해 기존 account permission `check(accountId, page, action)`을 사용한다. auth-service가 account_groups/group permissions를 materialize한 결과를 판정하므로 게이트웨이의 `X-User-Groups` 계약을 유지한다.
- `X-Is-System-Master=true` bypass는 두 경로 공통으로 수정 없이 먼저 적용한다.
- `AROLOGIS_MASTER` role bypass는 role 헤더가 있는 아로로지스 독립 로그인 경로에서만 허용한다. 게이트웨이 경로에는 role 헤더가 없으므로 전역 role header를 복구하지 않는다.
- `services/arologis-service/src/main/resources/application.yml`의 `enforcement-mode: role`, 게이트웨이 코드, 권한 시드는 변경하지 않았다.
- 기존 독립 role 단위 테스트는 자체 JWT authority를 함께 부여하도록 갱신하여 운영 필터 계약을 반영했다.

## GREEN-A/B/C 원문

### GREEN 실행 원문: RED-A/B/C 포함 PermissionAspectTest

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon.
Daemon will be stopped at the end of the build 
> Task :shared:security:compileJava
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes
> Task :shared:security:compileTestJava
> Task :shared:security:processTestResources NO-SOURCE
> Task :shared:security:testClasses
> Task :shared:security:test

BUILD SUCCESSFUL in 16s
4 actionable tasks: 3 executed, 1 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

### GREEN 최종 확인 원문: arologis JWT/header filter tests

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon.
Daemon will be stopped at the end of the build 
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:discovery-abstraction:compileJava UP-TO-DATE
> Task :services:arologis-service:processResources UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:discovery-abstraction:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:discovery-abstraction:classes UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :services:arologis-service:processTestResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:discovery-abstraction:jar UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :services:arologis-service:compileJava UP-TO-DATE
> Task :services:arologis-service:classes UP-TO-DATE
> Task :services:arologis-service:compileTestJava UP-TO-DATE
> Task :services:arologis-service:testClasses UP-TO-DATE
> Task :shared:security:jar
> Task :services:arologis-service:test

BUILD SUCCESSFUL in 17s
15 actionable tasks: 2 executed, 13 up-to-date
```

## 최종 판정

- `PermissionAspect.java:166-207,357-358`에서 role 헤더 존재 여부로 두 진입 경로를 분기한다.
- 게이트웨이 직원 경로: role 없음 → `X-User-Id` account UUID + auth-service effective account/group 권한 확인.
- 아로로지스 독립 로그인 경로: 자체 JWT filter가 주입한 role 있음 → 기존 `role_page_permissions` role 권한 확인.
- `X-Is-System-Master=true` bypass는 계속 선행되고, `AROLOGIS_MASTER` bypass는 role 경로에서만 유지된다.
- RED-A/B/C와 추가 실행/DRIVER 반대급부 테스트가 GREEN이다.
- 상태: **DONE_WITH_CONCERNS** — 코드 및 관련 단위 테스트는 GREEN이나, 사용자 제약 때문에 실 게이트웨이 경유 브라우저와 DB-backed controller 통합 테스트는 실행하지 않았다.

## 신규 파일 목록

- `docs/dev-reports/2026-08-04-1039-r16-arologis-authz-fix.md`

## 이 라운드가 보지 않은 것

- fresh `dev_manager(MANAGER)` 브라우저 세션으로 실제 배포 게이트웨이 → `/admin/arologis/dispatches/pre-classify` 조회를 재실행하지 않았다.
- 실제 DB seed에 연결한 arologis controller 통합 테스트와 실행 endpoint의 실 응답은 보지 않았다. 해당 테스트는 Testcontainers/DB write 가능성이 있어 사용자 제한상 실행하지 않았다.
- 운영 배포 이미지 재빌드·서비스 재배포·컨테이너 중지·Docker 스택 상태 변경은 하지 않았다.
- DB write와 `role_page_permissions`/`group_page_permissions`/`account_page_permissions` 시드 변경은 하지 않았다.
- `services/api-gateway/**`, `services/slip-service/**`, `services/accounting-service/**`, `services/inventory-service/**` 및 지정된 desktop 파일은 수정하지 않았다.
- 저장소 전체 테스트 스위트, 매출전표 403 경로, 8개 가배차 모드 전체, CSV/저장/발행 결과는 보지 않았다.
- git 명령은 실행하지 않았다.

### 최종 GREEN 원문: shared:security 전체 테스트 재실행

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon.
Daemon will be stopped at the end of the build 
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:security:compileTestJava UP-TO-DATE
> Task :shared:security:processTestResources NO-SOURCE
> Task :shared:security:testClasses UP-TO-DATE
> Task :shared:security:test

BUILD SUCCESSFUL in 15s
4 actionable tasks: 1 executed, 3 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

### GREEN 최종 확인 원문: helper 명확화 후 PermissionAspectTest

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon.
Daemon will be stopped at the end of the build 
> Task :shared:security:compileJava
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes
> Task :shared:security:compileTestJava UP-TO-DATE
> Task :shared:security:processTestResources NO-SOURCE
> Task :shared:security:testClasses UP-TO-DATE
> Task :shared:security:test

BUILD SUCCESSFUL in 14s
4 actionable tasks: 2 executed, 2 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

- GREEN-A: role 없는 게이트웨이 MANAGER가 `check(accountId, arologis.dispatch.ops, VIEW)=true`로 허용됨.
- GREEN-B: role 없는 게이트웨이 ACCOUNTANT가 동일 account 경로의 `false`로 거부됨.
- GREEN-C: 독립 role 경로가 `canView(AROLOGIS_MANAGER, arologis.dispatch.ops)`를 사용해 허용됨.

### GREEN 추가 검증 원문: shared:security 전체 테스트

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon.
Daemon will be stopped at the end of the build 
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:security:compileTestJava UP-TO-DATE
> Task :shared:security:processTestResources NO-SOURCE
> Task :shared:security:testClasses UP-TO-DATE
> Task :shared:security:test

BUILD SUCCESSFUL in 13s
4 actionable tasks: 1 executed, 3 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```

### GREEN 추가 검증 원문: arologis 자체 JWT/header filter 단위 테스트

실행 대상은 `ArologisJwtFilterTest`, `HeaderAuthenticationFilterTest`뿐이다. arologis 통합 테스트와 Testcontainers는 DB write 가능성이 있어 실행하지 않았다.

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon.
Daemon will be stopped at the end of the build 
> Task :shared:realtime-abstraction:processResources UP-TO-DATE
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:common:compileJava UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:common:processResources NO-SOURCE
> Task :shared:common:classes UP-TO-DATE
> Task :shared:common:jar UP-TO-DATE
> Task :shared:realtime-abstraction:compileJava UP-TO-DATE
> Task :shared:realtime-abstraction:classes UP-TO-DATE
> Task :shared:realtime-abstraction:jar UP-TO-DATE
> Task :shared:discovery-abstraction:compileJava FROM-CACHE
> Task :shared:discovery-abstraction:processResources
> Task :shared:discovery-abstraction:classes
> Task :shared:discovery-abstraction:jar
> Task :shared:security:jar
> Task :services:arologis-service:processResources
> Task :services:arologis-service:compileJava
> Task :services:arologis-service:classes
> Task :services:arologis-service:compileTestJava
> Task :services:arologis-service:processTestResources NO-SOURCE
> Task :services:arologis-service:testClasses
> Task :services:arologis-service:test

BUILD SUCCESSFUL in 25s
15 actionable tasks: 7 executed, 1 from cache, 7 up-to-date
```

- 자체 JWT filter 테스트 GREEN: 검증된 role claim이 `X-User-Role`로 주입된다.
- header filter 테스트 GREEN: 게이트웨이 `X-User-Groups`가 group authority로 변환되고 role authority는 만들지 않는다.

### GREEN 추가 원문: 실행 및 DRIVER 반대급부 회귀 테스트

- `PermissionAspectTest`에 게이트웨이 MANAGER의 `UPDATE` 실행 허용과 DRIVER의 `VIEW` 거부를 추가했다.

```text
To honour the JVM settings for this build a single-use Daemon process will be forked. For more on this, please refer to https://docs.gradle.org/8.10.2/userguide/gradle_daemon.html#sec:disabling_the_daemon.
Daemon will be stopped at the end of the build 
> Task :shared:security:compileJava UP-TO-DATE
> Task :shared:security:processResources UP-TO-DATE
> Task :shared:security:classes UP-TO-DATE
> Task :shared:security:compileTestJava
> Task :shared:security:processTestResources NO-SOURCE
> Task :shared:security:testClasses
> Task :shared:security:test

BUILD SUCCESSFUL in 14s
4 actionable tasks: 2 executed, 2 up-to-date
OpenJDK 64-Bit Server VM warning: Sharing is only supported for boot loader classes because bootstrap classpath has been appended
```
