# SP-D6-2 Implementation Plan — groupware + product + partner-order @RequirePermission 마이그레이션

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** groupware/product/partner-order RBAC endpoint 를 `@RequirePermission` 으로 이전하고 신규 PageCode + V30 seed + FE 매트릭스를 동기화한다.

**Architecture:** 기존 정적 role list 는 PageCode/action 으로 치환한다. 대표실/인증/internal 같은 비-RBAC guard 는 유지하고, 각 서비스는 direct HTTP `DefaultDynamicPermissionClient` bean 으로 auth-service internal permission API 를 호출한다.

**Tech Stack:** Spring Boot MVC, Spring Security method security, shared:security `@RequirePermission`, Flyway, React/TypeScript permission matrix.

---

### Task 1: 문서와 PageCode seed

**Files:**
- Create: `docs/superpowers/specs/2026-05-26-sp-d6-2-groupware-product-partner-order-permission-migration-design.md`
- Create: `docs/superpowers/plans/2026-05-26-sp-d6-2-groupware-product-partner-order-permission-migration.md`
- Modify: `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java`
- Create: `services/auth-service/src/main/resources/db/migration/V30__seed_sp_d6_2_page_codes.sql`

- [ ] 신규 PageCode 6개를 enum 에 추가한다: `messenger.admin`, `messenger.send`, `products.edit-requests`, `products.ecount-import`, `sales.partner-order.edit-requests`, `sales.partner-order.tutorial`.
- [ ] V30 seed 는 MASTER bootstrap 과 실사용 role 을 `ON CONFLICT DO NOTHING` 으로 추가한다.

### Task 2: service-side DPC 설정

**Files:**
- Create: `services/groupware-service/src/main/java/com/samhanair/logis/groupware/config/DynamicPermissionClientConfig.java`
- Create: `services/product-service/src/main/java/com/samhanair/logis/product/config/DynamicPermissionClientConfig.java`
- Create: `services/partner-order-service/src/main/java/com/samhanair/logis/partnerorder/config/DynamicPermissionClientConfig.java`
- Modify: service `application.yml`
- Modify: `infrastructure/docker-compose.local-all.yml`

- [ ] SP-D6-1 dashboard/dc-config 와 동일하게 `RestClient.builder()` + `${samhan.auth-service.url:http://localhost:8081}` 를 사용한다.
- [ ] groupware `spring.jpa.properties.jakarta.persistence.lock.timeout: 3000` 을 추가한다. product/partner-order 는 이미 있으면 유지한다.
- [ ] local-all compose 의 3개 service env 에 `SAMHAN_AUTH_SERVICE_URL: http://auth-service:8081` 를 추가한다.

### Task 3: controller migration

**Files:**
- Modify groupware `GroupwareAdminController.java`
- Modify product controllers: `ProductEditRequestController`, `CategoryController`, `EcountProductImportController`, `ProductByCodeController`, `ProductController`
- Modify partner-order controllers: edit-request, vendor, confirm/delete/draft/edit/from-estimate/history/list/print/tutorial

- [ ] `@RequirePermission` import 를 추가하고 RBAC role list `@PreAuthorize` 를 제거한다.
- [ ] groupware 대표실 static guard 는 `@hr.isExecutiveOffice()` 만 유지한다.
- [ ] `isAuthenticated()`/internal token endpoint 는 변경하지 않는다.
- [ ] 기존 manual `ProductPermissionGuard` / `PartnerOrderPermissionGuard` 중복 체크는 `@RequirePermission` 으로 대체 가능한 controller path 에서 제거한다.

### Task 4: permission tests

**Files:**
- Add/modify WebMvcTest 권한 테스트 in each service test tree.

- [ ] `@WebMvcTest` + `PermissionSecurityAutoConfiguration` + `SimpleMeterRegistry` + header auth filter 를 사용한다.
- [ ] 각 service 별 grant 2xx와 no grant 403 + Counter 증가를 검증한다.
- [ ] 기존 SpringBootTest permission IT 가 신규 권한 AOP 와 충돌하면 slice test 로 대체한다.

### Task 5: FE permission matrix

**Files:**
- Modify: `clients/desktop/src/renderer/api/permissionsApi.ts`
- Modify: `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`

- [ ] 신규 PageCode union literal 6개를 추가한다.
- [ ] "메신저" 그룹과 상품/거래처주문 label/edit set 을 갱신한다.
- [ ] 신규 MASTER-only 코드가 없으므로 `SYSTEM_ONLY_PAGES` 는 유지한다.

### Task 6: verification and commit

- [ ] Run:

```powershell
$env:GRADLE_USER_HOME='C:\dev\SamhanLogis\.gradle\codex-home'
.\gradlew.bat :services:groupware-service:test :services:product-service:test :services:partner-order-service:test :services:auth-service:test :shared:security:test --no-daemon
cd clients/desktop
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

- [ ] Single commit:

```text
[FEAT] SP-D6-2 — groupware + product + partner-order @PreAuthorize → @RequirePermission 마이그레이션 (~35 endpoint + 6 신규 PageCode + V30 seed + 3 service DPC bean)
```

---

## Self-Review

- [x] SP-D6-1 spec/plan 구조를 따름.
- [x] 신규 PageCode 는 V10에 없는 것만 추가.
- [x] `isAuthenticated()` / internal endpoint 보존 명시.
- [x] WebMvcTest 권한 테스트와 Counter 검증 포함.
