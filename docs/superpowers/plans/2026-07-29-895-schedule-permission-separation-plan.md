# 일정 권한 메신저 분리 Implementation Plan

> **For agentic workers:** This plan is executed inline because the developer prohibited git operations and service restarts.

**Goal:** 일정 endpoint를 `groupware.schedules` 권한으로 분리하고 등록자 본인만 수정·삭제하도록 보장한다.

**Architecture:** auth-service는 PageCode enum과 새 V90 멱등 seed로 일정 page-code를 등록한다. groupware-service는 모든 일정 endpoint에 이 page-code를 사용하고, ScheduleService에서 호출자 UUID와 일정 owner UUID를 비교해 update/delete 객체 권한을 집행한다. 기존 조회 repository query는 변경하지 않는다.

**Tech Stack:** Java 21, Spring Boot, Spring MVC, Spring Security method aspect, Spring Data JPA, Flyway, JUnit 5, Mockito, Testcontainers PostgreSQL.

## Global Constraints

- 기존 적용 Flyway migration은 수정하지 않는다. 새 migration은 현재 최대 V89 다음인 V90을 사용한다.
- `services/groupware-service`와 일정 page-code 등재에 필요한 `services/auth-service`만 수정한다.
- git, docker compose, 서비스 재기동, 이미지 빌드, clients/**, 공휴일·달력·알림 변경은 하지 않는다.
- fixture는 API 또는 도메인의 정상 생성 경로로 만든다. 권한 상태를 raw SQL로 심지 않는다.
- 새 Testcontainers IT에는 ubuntu-latest에서도 동일함을 명시한다.

### Task 1: RED 일정 권한 회귀 테스트

**Files:**
- Modify: `services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/GroupwareAdminControllerIT.java`

- [ ] 실제 POST API로 owner 일정 생성 후 MANAGER 비소유자 DELETE가 403인지 검증하는 테스트를 추가한다.
- [ ] `messenger.send` 거부와 `groupware.schedules` CREATE 허용을 DynamicPermissionClient mock으로 구성하고 실제 POST가 201인지 검증하는 테스트를 추가한다.
- [ ] `:services:groupware-service:test --tests '*GroupwareAdminControllerIT' --rerun-tasks --no-build-cache`로 RED 원문을 저장한다.

### Task 2: auth-service 일정 page-code 등재

**Files:**
- Modify: `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java`
- Create: `services/auth-service/src/main/resources/db/migration/V90__seed_groupware_schedules_page_permission.sql`
- Modify: `services/auth-service/src/test/java/com/samhanair/logis/auth/domain/PageCodeTest.java`

- [ ] `GROUPWARE_SCHEDULES("groupware.schedules", "그룹웨어 일정")`을 enum에 추가한다.
- [ ] V90에서 내부 Role 10종에 VIEW/EDIT true를 seed하고 `ON CONFLICT ... DO UPDATE`로 멱등성을 보장한다. PARTNER는 제외한다.
- [ ] PageCode enum/문자열 유효성 테스트를 추가한다.

### Task 3: groupware 일정 권한 및 owner guard 구현

**Files:**
- Modify: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/controller/GroupwareAdminController.java`
- Modify: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/service/ScheduleService.java`

- [ ] 일정 네 endpoint의 page-code를 `groupware.schedules`로 변경한다.
- [ ] DELETE controller가 `X-User-Id` UUID를 받아 service로 전달하게 한다.
- [ ] ScheduleService.delete가 owner mismatch에 `BusinessException(ErrorCode.FORBIDDEN, ...)`를 던지고 일치할 때만 soft delete한다.
- [ ] update의 기존 owner guard와 GET의 owner/active participant query는 유지한다.

### Task 4: GREEN 및 전체 검증

**Files:**
- Modify: `services/groupware-service/src/test/java/com/samhanair/logis/groupware/it/GroupwarePermissionControllerIT.java`
- Modify: `services/auth-service/src/test/java/com/samhanair/logis/auth/domain/PageCodeTest.java`

- [ ] 권한 endpoint contract fixture를 새 page-code로 갱신한다.
- [ ] 두 RED 테스트가 GREEN인지 확인한다.
- [ ] 두 서비스 전체 테스트를 각각 `--rerun-tasks --no-build-cache`로 실행한다.
- [ ] Testcontainers skip 여부와 fresh PostgreSQL migration 적용 결과를 원문으로 기록한다.
