# SP-D6-3 Implementation Plan — notification + user @RequirePermission 마이그레이션

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** notification/user service 의 정적 RBAC endpoint 를 `@RequirePermission` 으로 이전하고 V33 seed, DPC bean, FE 권한 매트릭스, slice test 를 동기화한다.

**Architecture:** 대표실, internal, authenticated 같은 비-RBAC guard 는 유지한다. 역할별 권한은 PageCode/action 과 auth-service permission check 로 이동하며, 각 service 는 direct HTTP `DefaultDynamicPermissionClient` bean 을 가진다.

**Tech Stack:** Spring Boot MVC, Spring Security method security, shared:security `@RequirePermission`, Flyway, React/TypeScript permission matrix.

---

### Task 1: 문서와 seed

**Files:**
- Create: `docs/superpowers/specs/2026-05-26-sp-d6-3-notification-user-permission-migration-design.md`
- Create: `docs/superpowers/plans/2026-05-26-sp-d6-3-notification-user-permission-migration.md`
- Create: `services/auth-service/src/main/resources/db/migration/V33__seed_sp_d6_3_page_codes.sql`
- Modify: `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java`

- [ ] 신규 PageCode 4개를 enum/seed 에 추가한다: `notifications.admin`, `aligo.address-book`, `dispatch.sms-save-history`, `dispatch.batch`.
- [ ] V33 은 11-role matrix row 를 모두 생성하고 신규 broad role 은 FALSE/FALSE 로 시작한다.
- [ ] 기존 `messenger.admin`, `admin.*`, `ecount.mig*` 는 재사용한다.

### Task 2: DPC 설정과 config

**Files:**
- Create: `services/notification-service/src/main/java/com/samhanair/logis/notification/config/DynamicPermissionClientConfig.java`
- Create: `services/user-service/src/main/java/com/samhanair/logis/user/config/DynamicPermissionClientConfig.java`
- Modify: `services/notification-service/src/main/resources/application.yml`
- Modify: `services/user-service/src/main/resources/application.yml`
- Modify: `infrastructure/docker-compose.local-all.yml`

- [ ] `${samhan.auth-service.url:http://localhost:8081}` + `${SAMHAN_AUTH_SERVICE_URL:http://localhost:8081}` 를 연결한다.
- [ ] 두 service 에 `spring.jpa.properties.jakarta.persistence.lock.timeout: 3000` 을 추가한다.
- [ ] local-all compose notification/user env 에 `SAMHAN_AUTH_SERVICE_URL: http://auth-service:8081` 를 둔다.

### Task 3: controller migration

**Files:**
- Modify notification controllers: `NotificationAdminController`, `AligoAddressBookController`, `ChatRoomMappingAdminController`, `DispatchBatchAdminController`, `DispatchSmsSaveHistoryController`
- Modify user controllers: `AdminUserController`, `Ecount*ImportController`, `EmployeeController`

- [ ] notification admin/list/write endpoint 에 `@RequirePermission` 을 붙이고 role list `@PreAuthorize` 를 제거한다.
- [ ] `AdminUserController` 는 `@hr.isExecutiveOffice()` static guard 를 유지하고 PageCode 를 read/write 로 분리한다.
- [ ] `EmployeeController` 의 MASTER-only write endpoint 는 기존 static guard 를 유지한다.
- [ ] `isAuthenticated()` / `/internal/**` endpoint 는 변경하지 않는다.

### Task 4: permission tests

**Files:**
- Create: `services/notification-service/src/test/java/com/samhanair/logis/notification/it/NotificationPermissionControllerIT.java`
- Create: `services/user-service/src/test/java/com/samhanair/logis/user/it/UserPermissionControllerIT.java`
- Modify existing SpringBootTest IT DPC mocks as needed.

- [ ] `@WebMvcTest` + `PermissionSecurityAutoConfiguration` + `SimpleMeterRegistry` 를 사용한다.
- [ ] 각 변환 endpoint grant success / deny 403 + Counter 증가를 검증한다.
- [ ] 기존 IT 는 DPC mock default true 를 둬 auth-service real call 을 차단한다.

### Task 5: FE permission matrix

**Files:**
- Modify: `clients/desktop/src/renderer/api/permissionsApi.ts`
- Modify: `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`

- [ ] 신규 PageCode literal 과 label 을 추가한다.
- [ ] 배차/알림/직원·계정 그룹에 신규 및 재사용 import PageCode 를 배치한다.
- [ ] EDIT 의미가 있는 코드들은 `PAGES_WITH_EDIT` 에 포함한다.

### Task 6: verification and commit

- [ ] Run:

```powershell
$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'
.\gradlew.bat :services:notification-service:test :services:user-service:test :services:auth-service:test :shared:security:test --no-daemon
cd clients/desktop
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

- [ ] Commit only; do not push:

```text
[FEAT] SP-D6-3 — notification + user @PreAuthorize → @RequirePermission 마이그레이션 (~31 endpoint + N 신규 PageCode + V33 seed + 2 service DPC bean)
```

---

## Self-Review

- [x] SP-D6-2 문서 구조를 따름.
- [x] 신규 PageCode 는 기존 seed 에 없는 것만 추가.
- [x] 대표실/static/internal/authenticated 예외를 명시.
- [x] `@WebMvcTest` grant/deny + Counter 검증을 포함.
