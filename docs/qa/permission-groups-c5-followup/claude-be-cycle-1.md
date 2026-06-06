# PR #417 BE 리뷰 — 권한그룹 C5 후속 정리 (claude-be-cycle-1)

> 브랜치: `fix/permission-groups-c5-followup-cleanup`
> 리뷰어: Claude BE agent
> 사이클: 1
> 날짜: 2026-06-07

---

## 결함표

### P0 — 없음

### P1 — 없음

### P2

#### P2-1 — accounting prometheus gate authenticated() 전환: 보안 수준 동일 확인 완료 (내용 정정)

- **위치**: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/config/SecurityConfig.java`
- **내용**: `.requestMatchers("/actuator/prometheus").hasRole("MASTER")` → `.authenticated()` 전환이 보안 약화로 보일 수 있으나, `InternalTokenFilter` 가 `/actuator/prometheus` 를 `path-prefix` 로 가지고 `allow-missing-token = false` 로 설정되어 있으므로 토큰 없는 요청은 `writeUnauthorized()` 후 `return` (chain 비호출) → `HeaderAuthenticationFilter` 에 도달하지 않는다. 실효 보안 수준 동일.
- **권고**: 코드 자체는 올바르지만, `PrometheusSecurityConfigTest` 의 테스트 명칭이 `prometheus_endpoint_doesNotDependOnRoleAuthority` 로만 검증하여 `InternalTokenFilter` + `allow-missing-token=false` 조합이 실질 토큰 게이트임을 명시하지 않는다. Javadoc 또는 테스트 주석에 "InternalTokenFilter(allow-missing-token=false) 가 실 게이트임" 한 줄 추가 권장.
- **판정**: 보안 약화 없음. Nit 수준이나 문서화 명확성을 위해 기록.

#### P2-2 — canQuerySales(auth) 의 FE isSystemMaster 미반영

- **위치**: `clients/desktop/src/renderer/stores/session.ts` `canQuerySales`
- **내용**: BE `SlipSalesAccessGuard.canReadOutboundSales` 는 `X-Is-System-Master=true` 를 독립적인 bypass 경로로 처리한다. FE `canQuerySales(auth)` 는 `hasBuiltinRoleGroup(auth, 'MASTER')` 로만 판정하므로, `isSystemMaster=true` 이면서 MASTER 빌트인 그룹에 미배속인 계정(실운영 불가 시나리오이나 이론상 가능)이 FE 에서 진입 차단 → BE는 허용하는 역방향 FE-shows-BE-blocks 가 발생한다.
- **심각도**: 실운영에서 auth-service 는 isSystemMaster=true 계정을 MASTER 빌트인 그룹에 배속하므로 현실적 위험은 낮음. 다만 FE-BE 계약 문서에 명시된 허용 집합과 구현이 불일치.
- **권고**: `canQuerySales` Javadoc 에 "현재 FE snapshot 에 isSystemMaster 필드 없음 — MASTER 그룹 배속 기반 판정으로 대리하며 auth-service 발급 정책상 동일 집합" 을 명시하거나, `AuthSnapshot` 에 `isSystemMaster?: boolean` 필드를 추가하는 후속 이슈 생성.

### Nit

#### Nit-1 — AuthFlywayV47SeedIT canDelete 검증 누락

- **위치**: `services/auth-service/src/test/java/com/samhanair/logis/auth/it/AuthFlywayV47SeedIT.java`
- **내용**: V47 seed 에서 `can_delete=FALSE` 를 명시했으나 IT 에서 `assertThat(canUpdate).isFalse()` 만 검증하고 `canDelete / canRestore / canDownload / canPrint` 는 검증하지 않는다. seed 오타로 `can_delete=TRUE` 가 됐을 때 테스트가 통과하는 false-green 가능성.
- **권고**: 본 PR 에서 `canDelete / canRestore` 도 `assertThat(...).isFalse()` 로 추가. 코드 변경 최소.

#### Nit-2 — InventoryPermissionControllerIT withActor 에 ROLE_HEADER 전송 계속

- **위치**: `services/inventory-service/src/test/java/com/samhanair/logis/inventory/it/InventoryPermissionControllerIT.java` `withActor()`
- **내용**: `withActor()` 가 `.header(ROLE_HEADER, role)` 을 전송하지만 `HeaderAuthenticationFilter` 가 이를 무시하므로 role 값은 실제 인가에 영향 없다. 테스트 의미론상 role 파라미터가 '어느 역할 actor 인지 라벨' 역할만 남아 혼란을 준다.
- **권고**: 주석으로 "X-User-Role은 C5 이후 HeaderAuthenticationFilter 에서 무시됨 — 이 헤더는 IT 케이스 라벨 목적으로만 전송" 한 줄 추가.

#### Nit-3 — isMissingUserIdCase 헬퍼 중복 정의

- **위치**: `EcountMig6AccountingImportControllerIT` / `EcountMig7CashTransformControllerIT` / `EcountMig8OrderTransformControllerIT` / `EcountMig9CashJournalControllerIT` / `EcountMig10OrderEmployeeBackfillControllerIT` / `EcountMig11LedgerImportControllerIT` (accounting-service IT 군)
- **내용**: `isMissingUserIdCase(String label)` 가 각 IT 클래스에 동일 로직으로 복제되어 있다.
- **권고**: accounting IT 공통 abstract class 나 static utility 로 추출. 본 PR 규모 고려 시 후속 리팩터링 이슈로 기록해도 무방.

#### Nit-4 — HeaderAuthenticationFilterTest 14개가 동일 코드

- **위치**: 14개 서비스 `config/HeaderAuthenticationFilterTest.java` (신규)
- **내용**: 모든 서비스에서 완전히 동일한 테스트 코드가 복제됨.
- **권고**: 기능적으로는 각 서비스가 독립 컴파일/테스트 단위이므로 허용 가능. 향후 shared-test 모듈 검토 권장.

---

## 핵심 중점 항목 점검 결과

### 1. S2 dead-code 제거 안전성 (ROLE_ 제거)

**결론: 안전. 제거 대상이 진짜 도달 불가였음 확인.**

- 브랜치 기준 `git diff` 에서 14개 서비스 `HeaderAuthenticationFilter` 에 `ROLE_` authority 생성 코드가 모두 제거됨을 확인.
- 각 서비스 production main 코드에서 비-INTERNAL `hasRole()` / `hasAuthority("ROLE_")` 소비처 검색:
  - `slip-service SlipSalesQueryController`, `SlipInternalController`: `@RequestMapping("/internal/slips")` 경로에만 `@PreAuthorize("hasRole('MASTER')")` — InternalTokenFilter 가 ROLE_MASTER 를 부여하는 경로이므로 제거 대상 아님.
  - `user-service InternalUserController`: `@RequestMapping("/internal/users")` — 동일.
  - `accounting-service SecurityConfig`: `hasRole("MASTER")` → `authenticated()` 로 이미 전환됨.
  - `inventory-service InspectionAttachmentController`: `@PreAuthorize("hasAnyRole('MANAGER','MASTER')")` 제거됨 (C5-4 이후 always-false bug 수정 — 아래 항목 3 참조).
- `InternalTokenFilter` (shared) 및 `ArologisJwtFilter` (arologis) 보존 확인됨.
- **비-INTERNAL user-facing ROLE_ 소비처 잔존 0 건.**

### 2. user-service 401 재키잉 시맨틱 타당성

**결론: 타당함.**

- user-service 와 accounting-service `HeaderAuthenticationFilter` 의 `hasPartialIdentity` 조건에서 `role != null` 분기가 제거되고 `groups != null || IS_SYSTEM_MASTER_HEADER != null` 으로 재키잉됨.
- 실질: C5-4 이후 gateway 가 X-User-Role 을 주입하지 않으므로 기존 `role != null` 조건은 항상 false. 재키잉 결과 보안 동등.
- EcountMig6~11 IT 의 `missingUserId` 케이스 수정: X-User-Groups 헤더를 추가하여 `hasPartialIdentity=true` → 401 경로 검증. 의도에 부합.

### 3. accounting prometheus gate + inventory InspectionAttachmentController

**accounting prometheus:**
- `hasRole("MASTER")` → `authenticated()` 전환. InternalTokenFilter 가 path-prefix `/actuator/prometheus` 를 엄격하게 토큰 검증(allow-missing-token=false) → 토큰 없는 요청은 chain 미호출로 401. 실효 보안 수준 동일.

**inventory InspectionAttachmentController:**
- 기존 `@PreAuthorize("hasAnyRole('MANAGER','MASTER')")` 는 C5-4 이후 ROLE_ authority 가 더 이상 생성되지 않으므로 always-false = 모든 사용자 403 bug 상태였음.
- 제거 후 `@RequirePermission(page="inventory.stock-balance", action=DELETE)` 단일 가드: `DynamicPermissionClient.check()` 결과로 판정 → 정상화.
- IT 에서 WAREHOUSE + DELETE 권한 부여 → 200 기대로 변경 (기존 테스트가 always-false @PreAuthorize 의 잘못된 403 을 검증하고 있었음). 수정 방향 올바름.

### 4. S5 V47 migration 패턴 + PageCode + ProductAdminController action 적정성

**V47 migration:**
- `group_page_permissions` 에 MANAGER 그룹(00000000-0000-0000-0000-000000000101) 에 `products.sync` `can_view=TRUE, can_create=TRUE` 삽입.
- MASTER(00000000-0000-0000-0000-000000000100) row 없음 — is_system_master bypass 로 통과하므로 불필요. 기존 V43~V46 패턴과 일치.
- `ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE` — V42 partial unique index `uq_group_page_permissions_active` (동일 조건) 와 정확히 일치. idempotent 확인.
- `role_page_permissions / role_page_permission_templates` 갱신 없음 — C5 이후 진실원이 group_page_permissions 이므로 올바름.

**PageCode.PRODUCTS_SYNC:**
- `auth-service PageCode` enum 에 `PRODUCTS_SYNC("products.sync", "상품 시트 동기화")` 추가 확인.
- `PageCodeTest` 에서 `isValid("products.sync")` 단언 추가 확인.
- FE `permissionsApi.ts` `PageCode` union 에 `'products.sync'` 추가 확인.

**ProductAdminController @RequirePermission action:**
- `POST /sync` → `CREATE`: 시트→DB 동기화 실행 = 쓰기 작업. 적정.
- `GET /sync/last` → `VIEW`: 마지막 sync 메타 조회 = 읽기 작업. 적정.
- V47 seed: MANAGER `can_view=TRUE, can_create=TRUE` → 두 endpoint 모두 커버.

**ProductPermissionControllerIT:**
- `ProductAdminController` 신규 편입. `@MockBean ProductSheetSyncService`, `GoogleSheetsClient` 추가. lenient stub 설정 확인.
- `product sheet sync trigger` (CREATE), `product sheet sync last` (VIEW) 케이스 추가 확인.

### 5. CorsConfig X-User-Role 제거의 클라이언트 영향

- `CorsConfig.exposedHeaders` 에서 `HttpHeaderConstants.CALLER_ROLE_HEADER` 제거.
- C5-4 이후 gateway 가 X-User-Role 을 주입하지 않으므로 클라이언트가 읽어도 항상 null/absent 였음. 제거로 인한 클라이언트 동작 변화 없음.
- FE 코드에서 response header 의 X-User-Role 을 읽는 코드 grep 결과 없음.
- `HttpHeaderConstants.CALLER_ROLE_HEADER` 상수는 잔존 (partner-order-service IT 등 테스트 및 legacy role-mode 문맥 사용). Javadoc 에 "gateway/downstream user authority 용도 아님" 명시됨.

### 6. 한국어 Javadoc / 컨벤션

- 14개 서비스 `HeaderAuthenticationFilter` Javadoc 갱신: "X-User-Role 수신해도 무시" 명시 확인.
- `ProductAdminController` Javadoc: "C5 후속 정리부터 products.sync page-code 로 보호" 갱신 확인.
- `HttpHeaderConstants.CALLER_ROLE_HEADER` Javadoc: legacy 역할 명시 확인.
- BaseEntity 7 audit + soft delete: V47 migration 에서 `created_at / created_by / modified_at / modified_by / is_deleted` 모두 포함. `version` 컬럼은 `group_page_permissions` 테이블 스키마에 없으므로 미포함 — 기존 V43 등 동일 패턴과 일치.
- `group_page_permissions` soft delete 아닌 `is_deleted=FALSE` 조건의 ON CONFLICT — soft delete 패턴과 일관.

---

## 추가 관찰

### AppLayout showDispatchSms 전환 (dynamicCanAccess → hasAnyBuiltinRoleGroup)

- 기존: `dynamicCanAccess('notification.dispatch-sms.send-audit', 'view') || canAccessDispatchSms(role)`
- 변경: `hasAnyBuiltinRoleGroup(auth, ['MASTER', 'MANAGER', 'DISPATCH'])`
- notification.dispatch-sms.send-audit page-code 에 seed 가 존재하면 dynamicCanAccess 가 더 정밀하다. 그러나 계획서 S3 원칙 "arologis role-mode 메뉴 = 그룹 기반 전환" 에 따른 의도적 결정. role 집합은 동일(DISPATCH/MANAGER/MASTER). 기능적으로 동등.

### AppLayout showBlockedPartners 변경

- `showPartnersBlock || dynamicCanAccess('partners.block.bulk', 'view')` — partners.block.bulk PageCode 실존 확인. seed 에서 MANAGER VIEW=TRUE 로 부여. 기능적으로 올바름.

### isMissingUserIdCase 와 IS_SYSTEM_MASTER_HEADER 401 시그널

- accounting-service 의 `hasPartialIdentity` 조건에 `IS_SYSTEM_MASTER_HEADER` 포함: `X-User-Id` 없이 `X-Is-System-Master` 만 있으면 비정상 조합 → 401. 게이트웨이는 항상 userId 와 함께 주입하므로 정상 트래픽 미해당. 타당함.

---

## 최종 판정

**조건부 APPROVE — 본 사이클 처리 항목 확인 후 머지 가능.**

식별된 결함:
- P2 2건: 모두 보안 약화 없음, 문서화/시맨틱 정밀도 이슈.
- Nit 4건: 테스트 검증 커버리지 및 코드 명료성.

**즉시 처리 권장 항목 (P2~Nit 중 우선순위):**

1. **Nit-1 처리 권장**: `AuthFlywayV47SeedIT` 에 `canDelete / canRestore / canDownload / canPrint` 이 `FALSE` 임을 확인하는 단언 추가 (false-green 방지).
2. **P2-1 문서화**: `AccountingPrometheusSecurityConfigTest` 에 "InternalTokenFilter(allow-missing-token=false)가 실 게이트" 주석 한 줄 추가.
3. **P2-2 문서화**: `canQuerySales` Javadoc 에 isSystemMaster 미반영 사유 명시.

P0/P1 결함 없음. 보안 회귀 없음. 사이클 2 진입 없이 fix 반영 후 머지 가능.
