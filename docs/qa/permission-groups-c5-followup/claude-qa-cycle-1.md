# PR #417 QA 리뷰 — Claude QA 사이클 1

**PR**: [FIX] 권한그룹 C5 후속 정리 — ROLE_ dead-code 제거 + FE 사이드바/가드 권한 전환 + 보류 3 라우트 PermissionGuard 화
**브랜치**: fix/permission-groups-c5-followup-cleanup
**리뷰어**: Claude QA agent
**날짜**: 2026-06-07
**환경**: Docker 로컬 스택, auth-service/product-service/api-gateway --rerun-tasks 재빌드 후 --build 이미지 재생성

---

## 실 QA 결과표

| 시나리오 | 항목 | 명령 | 기대 | 실측 | 판정 |
|---|---|---|---|---|---|
| S1 | V47 Flyway 적용 | `psql auth_db "SELECT ... FROM group_page_permissions WHERE page_code='products.sync'"` | MANAGER(…0101) row, can_view=t, can_create=t | row 확인, Flyway success=t (installed 15:43) | PASS |
| S2a | dev_master → GET /sync/last | `curl -H "Authorization: Bearer $MASTER_TOKEN"` | 200 (is_system_master bypass) | 200 | PASS |
| S2b | dev_manager → GET /sync/last | `curl -H "Authorization: Bearer $MANAGER_TOKEN"` | 200 (MANAGER group, V47 grant) | **403 account permission missing** | **FAIL** |
| S2c | dev_sales → GET /sync/last | `curl -H "Authorization: Bearer $SALES_TOKEN"` | 403 (비대상) | 403 | PASS |
| S2d | dev_master → POST /sync | `curl -X POST -H "Authorization: Bearer $MASTER_TOKEN"` | 200 | 200 | PASS |
| S2e | dev_sales → POST /sync | `curl -X POST -H "Authorization: Bearer $SALES_TOKEN"` | 403 | 403 | PASS |
| S3c | X-User-Role 위조 (JWT 없이) | `curl -H "X-User-Role: MASTER" -H "X-Is-System-Master: true"` | 401 (게이트웨이 JWT 검증) | 401 | PASS |
| S3d | product-service 직접 X-User-Role 위조 | `curl 8084 -H "X-User-Role: MASTER" -H "X-Is-System-Master: false" -H "X-User-Groups: …0102"` | 403 (ROLE_ dead-code 없음) | 403 | PASS |
| S4 | accounting prometheus 무인증 | `curl http://localhost:8087/actuator/prometheus` | 401 | 401 | PASS |
| S5 | mock 카탈로그 V47 정합 (코드 대조) | mock.ts grep products.sync | SP_D1_PAGES/DEFAULT_VIEW/EDIT에 존재 | 존재 확인 | PASS |

---

## 결함표

| ID | 심각도 | 항목 | 위치 | 현상 | 근본 원인 | 분류 |
|---|---|---|---|---|---|---|
| **DEF-1** | **CRITICAL** | V47 migration 후 MANAGER 그룹 배속 계정의 products.sync 403 | `V47__seed_products_sync_group_permission.sql` + `EffectivePermissionMaterializer` | dev_manager → GET /api/v1/products/admin/sync/last → 403 (group_page_permissions에 row 있으나 account_page_permissions 미반영) | V47 SQL이 group_page_permissions에만 INSERT하고 EffectivePermissionMaterializer.materializeForGroup()을 호출하지 않음. GroupPermissionService를 거치지 않는 직접 migration SQL이라 materializer 미트리거 | 본 PR 즉시 처리 |

---

## 결함 상세 — DEF-1

### 현상
```
GET /api/v1/products/admin/sync/last  (dev_manager JWT)
→ 403 Forbidden
   "reason=account permission missing"
```

### 재현 경로
1. V47 migration 실행 → group_page_permissions에 MANAGER 그룹 row 삽입
2. EffectivePermissionMaterializer는 GroupPermissionService.updateGroupPermissions() 호출 시에만 실행됨
3. Flyway 직접 SQL INSERT는 GroupPermissionService를 거치지 않음 → materializer 미실행
4. account_page_permissions에 products.sync row 없음 → AccountPermissionService.check() → false → 403

### DB 증거
```sql
-- group_page_permissions: row 존재 (정상)
SELECT group_id, page_code, can_view, can_create
FROM group_page_permissions
WHERE page_code='products.sync' AND is_deleted=FALSE;
-- → (00000000-0000-0000-0000-000000000101, products.sync, t, t)

-- account_page_permissions: dev_manager에 row 없음 (결함)
SELECT page_code FROM account_page_permissions
WHERE account_id='a0000000-0000-0000-0000-000000000003'::uuid
  AND page_code='products.sync' AND is_deleted=FALSE;
-- → (0 rows)
```

### 수정 방향
V47 migration SQL 뒤에 MANAGER 그룹 배속 계정 전체의 account_page_permissions를 rematerialize하는 SQL 구문 추가 (또는 auth-service 기동 후 한 번 실행하는 별도 초기화 훅). 가장 단순한 방법: auth-service 시작 시 ApplicationRunner에서 group_page_permissions와 account_page_permissions 비교 후 gap이 있는 계정을 rematerialize하는 로직 추가. 또는 V47 migration SQL에 직접 INSERT INTO account_page_permissions ... SELECT ... 구문 추가 (단, materializer 로직과 중복 주의).

### 영향 범위
- MANAGER 그룹(…0101) 배속 계정 전원 (dev_manager + 실 MANAGER 계정)
- products.sync CREATE (POST /admin/sync) + VIEW (GET /admin/sync/last) 모두 403
- MASTER는 X-Is-System-Master bypass이므로 영향 없음

---

## 양호 확인 항목

### S1 — V47 PageCode enum 추가
`PageCode.PRODUCTS_SYNC("products.sync", "상품 시트 동기화")` line 452 정상 추가. AuthFlywayV47SeedIT가 group_page_permissions 검증 커버.

### S2 — ProductAdminController @RequirePermission 부여
`@RequirePermission(page = "products.sync", action = PermissionAction.CREATE)` (POST /sync)
`@RequirePermission(page = "products.sync", action = PermissionAction.VIEW)` (GET /sync/last)
올바르게 부여됨.

### S3 — HeaderAuthenticationFilter ROLE_ dead-code 제거
auth-service, product-service 양쪽 모두 X-User-Role 파싱 + ROLE_ authority 생성 코드 완전 제거. GROUP_ authority만 생성하는 구조 정상 확인. 다운스트림 직접 접근 시 X-User-Role: MASTER 위조 주입해도 403 유지 (ROLE_ authority 미생성).

### S4 — accounting SecurityConfig /actuator/prometheus authenticated()
`/actuator/prometheus` → `authenticated()` 설정 정상. 직접 포트 무인증 → 401 확인.

### S5 — FE routes/index.tsx 보류 3 라우트 PermissionGuard 전환
- `/admin/sheet-sync` → `PermissionGuard(products.sync, view)` 전환 확인
- `/sales/vendor-order-upload` → `PermissionGuard(sales.vendor-order, view)` 전환 확인
- `/accounting/period-close` → `PermissionGuard(accounting.period-close, view)` 전환 확인

### S5 — AppLayout.tsx ROLE_ 정적 fallback 완전 제거
`*_SIDEBAR_ROLES` 5개 상수, `ACCOUNTING_EDIT_REQUEST_REVIEWER_ROLES`, `ARO_*_ROLES` 배차 메뉴 6개, 정적 헬퍼 `canAccessAdmin`/`canAccessAudit` 등 완전 제거 확인. canAccess(pageCode) 동적 전환 확인.

### S5 — mock.ts products.sync 카탈로그 정합
SP_D1_PAGES, MOCK_ACTION_ONLY_PAGES, DEFAULT_VIEW, DEFAULT_EDIT 모두 products.sync 추가. V47 seed (MANAGER: view+create) 와 정합.

### CorsConfig CALLER_ROLE_HEADER 제거
exposedHeaders에서 X-User-Role 제거, X-User-Groups + X-User-Id만 노출. C5-4 gateway 주입 제거 후 불필요 헤더 정리 완료.

---

## 환경 한계

- **inventory-service 재빌드 미실시**: 시나리오 3 inventory.transfer/stock-balance 200/403 매트릭스는 inventory-service가 stale JAR(PR 커밋 이전 빌드)를 사용해 500 반환 — inventory-service 재빌드 후 재검증 필요. 단, ROLE_ dead-code 제거 효과는 product-service 직접 접근 테스트(S3d)로 대체 검증 완료.
- **FE Playwright suite**: 계획서 §S5에 421 passed 기존 결과로 재실행 불요로 명시됨 — 생략 (코드 대조로 대체).

---

## 판정

**사이클 계속 필요 (APPROVE 보류)**

DEF-1 (CRITICAL): V47 migration 후 MANAGER 그룹 accounts에 products.sync 권한이 account_page_permissions에 materializer되지 않아 실제 서비스에서 403 발생. 본 PR의 핵심 기능(sheet-sync PermissionGuard 화)이 실 동작하지 않는 결함.

수정 후 재빌드 + 시나리오 2b (dev_manager → 200) 재검증 필요.

나머지 항목(S2a/c/d/e, S3, S4, S5, ROLE_ dead-code 제거, CorsConfig, PageCode, FE 전환)은 모두 PASS.
