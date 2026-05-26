# SP-D6-5 Inventory Permission Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** inventory-service의 `@PreAuthorize` 기반 endpoint를 `@RequirePermission`으로 이전하고 V35 seed, DPC bean, FE 권한 매트릭스, slice test를 동기화한다.

**Architecture:** role cap은 PageCode/action과 auth-service permission check로 이동한다. `@hr.isExecutiveOffice()`와 `isAuthenticated()` 예외는 유지하고, 기존 공용 PageCode가 원래 role cap보다 넓은 endpoint는 권한 확대 방지용 정적 role guard를 이중으로 둔다. inventory-service는 direct HTTP `DefaultDynamicPermissionClient` bean을 가진다.

**Tech Stack:** Spring Boot MVC, Spring Security method security, shared:security `@RequirePermission`, Flyway, React/TypeScript permission matrix.

---

### Task 1: 문서와 seed

**Files:**
- Create: `docs/superpowers/specs/2026-05-26-sp-d6-5-inventory-permission-migration-design.md`
- Create: `docs/superpowers/plans/2026-05-26-sp-d6-5-inventory-permission-migration.md`
- Create: `services/auth-service/src/main/resources/db/migration/V35__seed_sp_d6_5_inventory_page_codes.sql`
- Modify: `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java`

- [ ] 신규 PageCode 8개와 `ecount.import.inventory`를 enum/seed에 추가한다.
- [ ] V35는 11-role matrix row를 모두 생성하고 `ON CONFLICT DO NOTHING`을 사용한다.
- [ ] 기존 `inventory.warehouse`, `inventory.dps`는 V10 row를 재사용한다.

### Task 2: DPC 설정

**Files:**
- Create: `services/inventory-service/src/main/java/com/samhanair/logis/inventory/config/DynamicPermissionClientConfig.java`
- Modify: `services/inventory-service/src/main/resources/application.yml`
- Modify: `infrastructure/docker-compose.local-all.yml`

- [ ] `${samhan.auth-service.url:http://localhost:8081}`와 `${SAMHAN_AUTH_SERVICE_URL:http://localhost:8081}`를 연결한다.
- [ ] inventory local-all env에 `SAMHAN_AUTH_SERVICE_URL: http://auth-service:8081`를 둔다.

### Task 3: controller migration

**Files:** inventory controller 11개

- [ ] `isAuthenticated()` 첨부 조회/다운로드는 유지한다.
- [ ] 창고 mutation은 `@PreAuthorize("@hr.isExecutiveOffice()")`만 남기고 `@RequirePermission`을 추가한다.
- [ ] edit-request approve/reject/list는 `.decide` PageCode로 분리한다.
- [ ] Ecount import는 `ecount.import.inventory` EDIT로 통합한다.

### Task 4: tests

**Files:**
- Create: `services/inventory-service/src/test/java/com/samhanair/logis/inventory/it/InventoryPermissionControllerIT.java`
- Modify: `services/inventory-service/src/test/java/com/samhanair/logis/inventory/it/AbstractPostgresIT.java`

- [ ] `@WebMvcTest` + `PermissionSecurityAutoConfiguration` + `SimpleMeterRegistry`를 사용한다.
- [ ] 변환 endpoint 대표군에 대해 grant success / deny 403 + Counter 증가를 검증한다.
- [ ] 기존 SpringBootTest는 DPC mock default true를 둬 auth-service real call을 차단한다.

### Task 5: FE matrix

**Files:**
- Modify: `clients/desktop/src/renderer/api/permissionsApi.ts`
- Modify: `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`

- [ ] 신규 PageCode literal과 label을 추가한다.
- [ ] 재고 그룹에 신규 inventory/ecount 코드를 배치한다.
- [ ] EDIT 의미가 있는 신규 코드는 `PAGES_WITH_EDIT`에 포함한다.

### Task 6: verification and commit

- [ ] Run:

```powershell
$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'
.\gradlew.bat :services:inventory-service:test :services:auth-service:test :shared:security:test --no-daemon
cd clients/desktop
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

- [ ] Commit only; do not push:

```text
[FEAT] SP-D6-5 — inventory-service @PreAuthorize → @RequirePermission 마이그레이션 (~50 endpoint + N 신규 PageCode + V35 seed + DPC bean)
```
