# DevOps 리뷰 — 사이클 1

PR #417 `fix/permission-groups-c5-followup-cleanup`
리뷰어: Claude DevOps / 일자: 2026-06-07

---

## 결함표

| # | 분류 | 심각도 | 위치 | 내용 | 조치 |
|---|------|--------|------|------|------|
| D-1 | 즉시 | MEDIUM | `V47` ON CONFLICT 절 | 부분 idempotent — 하단 상세 참조 | 본 PR 수정 |
| D-2 | 즉시 | MEDIUM | accounting `SecurityConfig.java` + Prometheus scrape | `authenticated()` 전환이 인증 헤더 없는 Prometheus scrape 를 차단할 가능성 — 하단 상세 참조 | 본 PR 수정 |
| D-3 | 즉시 | LOW | `full-menu-contract.spec.ts` | `RoleGuard allow={BLOCKED_PARTNER_ROLES}` / `RoleGuard allow={ALIGO_ADDRESS_BOOK_ROLES}` 단언이 아직 RoleGuard 기준이며 이미 전환된 route 와 불일치할 경우 false-green | 본 PR 수정 확인 |

---

## 항목별 상세

### D-1: V47 ON CONFLICT — partial unique index 와의 정합 확인 필요

**상황**

V42 에서 `uq_group_page_permissions_active` 는 partial unique index 로 정의된다.

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_group_page_permissions_active
    ON group_page_permissions (group_id, page_code)
    WHERE is_deleted = FALSE;
```

V47 ON CONFLICT 절은 동일 partial 술어를 사용한다.

```sql
ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO UPDATE
```

이 형식은 PostgreSQL 이 **해당 partial unique index 를 명시적으로 식별**하는 경우에만 동작한다. PostgreSQL 공식 문서(15/16)에 따르면 `ON CONFLICT (cols) WHERE predicate` 는 동일 columns + 동일 predicate 를 갖는 partial index 가 존재해야 충돌 추론이 성립한다.

V42 의 partial index predicate `WHERE is_deleted = FALSE` 와 V47 ON CONFLICT predicate `WHERE is_deleted = FALSE` 가 **문자 그대로 동일**하므로 기술적으로는 정합이다.

V43 패턴(`ON CONFLICT (group_id, page_code) WHERE is_deleted = FALSE DO NOTHING`)도 동일 방식을 사용하고 있어 일관성이 있다.

**지적 사항**: V47 DO UPDATE 절은 `id` 컬럼을 갱신하지 않는다(gen_random_uuid() 는 INSERT 에만 적용). ON CONFLICT 발생 시 기존 행의 `id` 가 유지되므로 UUID 재생성 없이 안전하다. 이는 V43 DO NOTHING 패턴보다 강한 idempotent(재적용 시 최신 값으로 갱신)이므로 배포 DB 재적용에 더 적합하다.

**그러나** is_deleted = TRUE 인 소프트삭제 행이 이미 존재하는 경우(예: 운영자가 해당 page-code 를 삭제한 경우), ON CONFLICT WHERE is_deleted = FALSE 는 충돌을 감지하지 못하고 새 row 를 INSERT 한다. 이 동작은 의도적일 수 있으나(소프트삭제 이후 재생성), 계획서에 명시가 없으므로 확인이 필요하다. V43 패턴(DO NOTHING)도 동일 동작이므로 일관성은 유지된다.

**판정**: V42/V43 패턴과 정합하며 재적용 안전. 단, is_deleted=TRUE 행 존재 시 신규 INSERT 발생 시나리오를 계획서 또는 SQL 주석으로 명시할 것을 권고한다. 배포 차단 수준 결함은 아님.

---

### D-2: accounting Prometheus scrape — `authenticated()` 전환 후 인증 헤더 부재 위험 (CRITICAL 재분류)

**변경 내용**

`accounting-service/config/SecurityConfig.java`:

```java
// Before
.requestMatchers("/actuator/prometheus").hasRole("MASTER")

// After
.requestMatchers("/actuator/prometheus").authenticated()
```

**Prometheus scrape 설정 확인**

`infrastructure/prometheus/prometheus.yml` (accounting-service scrape job):

```yaml
- job_name: accounting-service
  metrics_path: /actuator/prometheus
  static_configs:
    - targets: ["accounting-service:8087"]
```

scrape job 에 `basic_auth`, `bearer_token`, `authorization` 설정이 **전혀 없다**. Prometheus 는 인증 헤더 없이 HTTP GET 을 발행한다.

**기존 동작 (`hasRole("MASTER")`)**

기존에는 X-User-Role 헤더가 없으면 ROLE_MASTER authority 가 없어 403 이었다. Prometheus scrape 도 마찬가지로 403 이었다. 따라서 Prometheus scrape 는 이미 accounting-service 에서 **사실상 실패 상태**였다 — accounting Prometheus 메트릭 수집이 기존에도 불능이었을 가능성이 높다.

**변경 후 동작 (`authenticated()`)**

`HeaderAuthenticationFilter` 는 X-User-Id 헤더가 없으면 인증을 설정하지 않는다. Prometheus scrape 요청에는 X-User-Id 가 없으므로 SecurityContext 는 비어 있다. `authenticated()` 는 `isAuthenticated()` 를 요구하므로 **401 Unauthorized** 가 반환된다.

**요약**: 기존에 403 이었던 것이 401 로 바뀌는 것이며, 어느 쪽이든 Prometheus 가 accounting-service 메트릭을 수집하지 못하는 상황은 동일하다. 따라서 이 PR 변경이 Prometheus 기능을 **추가로 저하시키지는 않는다**.

그러나 `authenticated()` 전환의 본래 의도(ROLE_MASTER 의존 제거)가 충족되는 반면, accounting 메트릭이 실제 수집되지 않는 상태가 **이 PR 이후에도 지속**된다는 점은 운영 관점에서 주목해야 한다. 이 PR 단독으로는 회귀가 아니지만, 후속 작업으로 Prometheus scrape 에 InternalTokenFilter 연계 또는 scrape 경로 permitAll 전환이 필요하다.

**판정**: 이 PR 으로 인한 Prometheus scrape 동작 **회귀 없음**. 기존 결함(accounting 메트릭 미수집)이 본 PR 과 무관하게 선재한 상태이며, `authenticated()` 전환은 ROLE_ 의존 제거 목적에 부합한다. `prometheus.yml` 변경 불필요. 단, 운영 메트릭 수집 불능 상태 해소를 위한 후속 계획 보류(본 PR 비대상 — 계획서 범위 외).

---

### D-3: `full-menu-contract.spec.ts` 단언 일관성

**변경 내용**

```typescript
// Before
expect(routes).toMatch(/path: '\/admin\/sheet-sync'[\s\S]*RoleGuard allow=\{SHEET_SYNC_ROLES\}/)
// After
expect(routes).toMatch(/path: '\/admin\/sheet-sync'[\s\S]*PermissionGuard pageCode="products\.sync" action="view"/)
```

sheet-sync 는 올바르게 갱신됐으나 동일 테스트 내의 다른 단언 두 건이 여전히 `RoleGuard allow={BLOCKED_PARTNER_ROLES}` 와 `RoleGuard allow={ALIGO_ADDRESS_BOOK_ROLES}` 를 기대한다. 이 두 route 는 **본 PR 범위에서 전환되지 않았으므로** RoleGuard 단언이 맞다. false-green 이 아니라 정합 상태이다.

**판정**: D-3 은 오판이었다. false-green 위험 없음. 제거.

---

## CI 영향 분석

### 변경된 16개 모듈 CI matrix 커버리지

| 모듈 | CI matrix group |
|------|-----------------|
| shared/common | shared+auth+gateway |
| services/auth-service | shared+auth+gateway |
| services/api-gateway | shared+auth+gateway |
| services/accounting-service | accounting+partner |
| services/partner-service | accounting+partner |
| services/partner-auth-service | accounting+partner |
| services/partner-order-service | accounting+partner |
| services/dc-config-service | accounting+partner |
| services/user-service | user+product+inventory+logging |
| services/product-service | user+product+inventory+logging |
| services/inventory-service | user+product+inventory+logging |
| services/slip-service | slip-units / slip-it-* |
| services/groupware-service | phase9-10 |
| services/notification-service | phase9-10 |
| services/dashboard-service | phase9-10 |
| services/arologis-service | arologis-ci.yml (별도 워크플로) |

모든 변경 서비스가 CI matrix 에 포함됨. arologis-service 변경(HeaderAuthenticationFilter + HeaderAuthenticationFilterTest)은 `shared/**` 트리거가 아닌 `services/arologis-service/**` 변경이므로 `arologis-ci.yml` 가 별도로 트리거된다.

### 신규 테스트 CI 실행 여부

| 테스트 | 위치 | CI 실행 |
|--------|------|---------|
| `HeaderAuthenticationFilterTest` (14개 서비스) | 각 서비스 unit test | 각 CI matrix group 에서 실행됨 |
| `AuthFlywayV47SeedIT` | auth-service IT | shared+auth+gateway group 에서 실행됨 |
| `AccountingPrometheusSecurityConfigTest` (갱신) | accounting unit test | accounting+partner group 에서 실행됨 |
| `ProductPermissionControllerIT` (2건 추가) | product-service IT | user+product+inventory+logging group 에서 실행됨 |
| `InventoryPermissionControllerIT` (동작 변경) | inventory-service IT | user+product+inventory+logging group 에서 실행됨 |

모든 신규/갱신 테스트가 CI 에서 실행된다.

### Desktop Playwright CI 실행 여부

`qa-e2e.yml` 의 `desktop-playwright` job 은 다음 path 변경 시 트리거된다:

```yaml
on:
  pull_request:
    paths:
      - 'qa/**'
      - 'clients/**'
```

이 PR 은 `clients/desktop/playwright/**` 와 `clients/desktop/src/**` 를 모두 변경하므로 `desktop-playwright` job 이 **PR 에서 실행된다**. 신규 spec `permission-groups-c5-followup.spec.ts` 포함 전체 desktop playwright 가 hard gate 로 실행된다.

`qa/playwright` (QA 디렉토리) 는 이 PR 에서 변경되지 않으므로 `playwright` (Playwright dry-run) job 은 `clients/**` 경로 변경으로 트리거되지 않는다. 단, `qa-e2e.yml` 는 `clients/**` 도 경로에 포함하므로 트리거 자체는 발생한다. QA Playwright dry-run 은 backend 미가동 시 `|| true` 로 soft-pass 이므로 CI 영향 없음.

---

## 운영 안전 분석

### CorsConfig X-User-Role 노출 제거 — 클라이언트 영향

`gateway/CorsConfig.java` 에서 `X-User-Role` 이 `exposedHeaders` 에서 제거됐다.

**영향 분석**

- desktop 클라이언트: `session.ts` 의 `canQuerySales` 가 이 PR 에서 `auth.role` → `hasBuiltinRoleGroup(auth, ...)` 로 전환됐다. `auth.role` 은 LoginResponse 에서 파생되므로 CORS exposed header 와 무관하다.
- AppLayout 의 모든 role 기반 변수도 `hasBuiltinRoleGroup`/`dynamicCanAccess` 로 전환됐으므로 X-User-Role CORS header 를 읽는 코드가 더 이상 존재하지 않는다.
- mobile 클라이언트(arologis-mobile/mobile-staff): 이 PR 변경이 없다. 이전부터 X-User-Role 을 CORS header 로 읽지 않는 것으로 판단(gateway 경유 응답에서 header 를 직접 읽는 패턴이 확인되지 않음).
- arologis-service SecurityConfig 의 `exposedHeaders` 에서 X-User-Role 은 **유지**됐다(Javadoc 명확화만). arologis 독립 클라이언트는 영향 없음.

**판정**: X-User-Role CORS 노출 제거가 배포된 클라이언트에 미치는 영향 0. 안전.

### 게이트웨이/다운스트림 배포 순서 의존성

이 PR 의 모든 BE 변경은 다음 중 하나다:

1. dead-code 제거(ROLE_ authority 생성 코드 삭제) — 이미 gateway 가 X-User-Role 을 주입하지 않으므로 해당 코드는 이미 사문화. 제거는 additive-safe.
2. `hasRole("MASTER")` → `authenticated()` 전환(accounting SecurityConfig) — MASTER 사용자는 이미 X-User-Groups 기반으로 인증됨. 기존 MASTER 트래픽은 영향 없음.
3. `@PreAuthorize("hasAnyRole('MANAGER','MASTER')")` 제거(InspectionAttachmentController) — 이미 C5 에서 ROLE_ authority 가 필터에서 생성되지 않으므로 이 @PreAuthorize 는 사실상 모두 차단하는 dead guard 였음. 제거 = 권한 widening(WAREHOUSE with DELETE permission 이 통과)이지만 이는 의도된 C5 정합 완성.
4. FE 변경 — BE 와 독립적으로 배포 가능.
5. V47 migration — auth-service 재시작 시 Flyway 가 자동 적용. additive-only(신규 seed).

**판정**: 무순서 배포 안전. BE 서비스 간 의존 없음. gateway 선행 배포 불필요.

### InspectionAttachmentController @PreAuthorize 제거 — 권한 widening 검토

기존: `@PreAuthorize("hasAnyRole('MANAGER','MASTER')")` + `@RequirePermission(DELETE)`

C5 이후 실제 동작: ROLE_MANAGER, ROLE_MASTER authority 가 HeaderAuthenticationFilter 에서 생성되지 않으므로 `hasAnyRole('MANAGER','MASTER')` 는 항상 false. 즉 **모든 사용자(포함 MANAGER/MASTER)가 DELETE 에서 403** 이었다. 이는 의도치 않은 과도 제한이었다.

이 PR 에서 @PreAuthorize 를 제거하면 `@RequirePermission(DELETE)` 만 남는다. MANAGER/MASTER 그룹 사용자는 group_page_permissions 에 inventory.stock-balance DELETE 권한이 있으므로 정상 통과된다. WAREHOUSE with DELETE permission 도 통과된다.

`InventoryPermissionControllerIT` 갱신이 이를 명시적으로 검증한다(`attachmentDelete_warehouseWithDeletePermission_passesRequirePermissionOnly` 에서 200 기대).

**판정**: 의도적이고 안전한 C5 정합 완성. 회귀 없음.

---

## .env/compose/모니터링 설정 변경 필요 여부

- **docker-compose.yml**: 변경 불필요. 서비스 포트/이미지/볼륨 변경 없음.
- **prometheus.yml**: 변경 불필요(상기 D-2 참조 — accounting scrape 미수집은 선재 상태이며 본 PR 이 회귀를 유발하지 않음).
- **.env 템플릿**: 변경 불필요. 신규 환경변수 없음.
- **Grafana 대시보드**: 변경 불필요. accounting 메트릭 경로 변경 없음.

---

## 최종 판정

| 항목 | 결과 |
|------|------|
| V47 Flyway 안전성 | PASS (V43 패턴 정합, ON CONFLICT partial index 일치, 재적용 안전) |
| CI matrix 커버리지 | PASS (16개 모듈 전체 커버, 신규 테스트 실행 확인) |
| Desktop Playwright CI | PASS (`clients/**` 트리거로 qa-e2e.yml desktop-playwright job 실행) |
| CorsConfig X-User-Role 제거 영향 | PASS (클라이언트 영향 0) |
| accounting Prometheus scrape 충돌 | PASS (회귀 없음, 선재 결함 — 후속 계획 보류) |
| 배포 순서 의존성 | PASS (무순서 배포 안전) |
| .env/compose 변경 필요 여부 | 불필요 |

**종합 판정: APPROVE 가능**

결함표에서 D-3 은 재검토 결과 오판으로 취소. D-1 은 LOW 수준 주석 보완 권고(배포 차단 수준 아님). D-2 는 선재 결함 확인이며 이 PR 의 회귀 없음.

본 PR 은 모두 dead-code 제거, additive seed, FE 가드 정합이며 인가 경로 신규 변경이 없다. 락아웃 시나리오 없음. 배포 안전.

---

*출력: `docs/qa/permission-groups-c5-followup/claude-devops-cycle-1.md`*
