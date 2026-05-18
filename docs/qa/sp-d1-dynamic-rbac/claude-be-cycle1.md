# SP-D1 동적 RBAC — BE 리뷰 (Claude, Cycle 1)

> 브랜치: `feat/sp-d1-dynamic-rbac-system` (commit `1904b65e`)
> 리뷰어: Claude BE Agent
> 일시: 2026-05-18

---

## 검증 범위

- auth-service: RolePagePermission / PageCode / RolePagePermissionRepository
- auth-service: DynamicPermissionService / PermissionAdminController + dto
- auth-service: SecurityConfig
- auth-service: V7__add_role_page_permissions.sql
- accounting-service: DynamicPermissionClient/Impl / TaxInvoiceEmitService 변경
- 단위 테스트: DynamicPermissionServiceTest (19) / PermissionAdminControllerTest (5)

---

## 검증 결과

### [PASS] BaseEntity 7 audit 필드 완전성

- `RolePagePermission extends BaseEntity` 확인.
- BaseEntity: `createdAt / createdBy / modifiedAt / modifiedBy / deletedAt / deletedBy / isDeleted` 7필드 모두 존재.
- `@SQLRestriction("is_deleted = false")` 엔티티 레벨 적용 — soft-delete 자동 필터 정상.
- V7 마이그레이션 DDL: 7 audit 컬럼 모두 명시적 선언. `created_by` NOT NULL + DEFAULT 'system', `modified_at / deleted_at` NULLable (legacy 호환).

### [PASS] version 필드 부재 — 의도적 설계

- 프로젝트 컨벤션 가드의 BaseEntity 정의에 `@Version` 필드가 없음.
- RolePagePermission 에도 별도 `@Version` 없음. Optimistic Lock 없이 운영. 단일 MASTER 사용 시나리오에서 동시성 충돌 가능성 낮아 수용 가능.
- **단, 향후 복수 MASTER 운영 시 재검토 권고.**

### [PASS] Soft Delete — 물리 삭제 금지 준수

- `deletePermission()`: `perm.markDeleted(actorId)` 호출 후 save. 물리 삭제(`repository.delete()`) 호출 없음.
- `findDeletedByRoleCodeAndPageCode` native query로 비활성 행 복구 접근 경로 제공 — 운영 복구 시나리오 고려됨.

### [PASS] 도메인 메서드 체인 — setter 직접 호출 금지

- `grantView / revokeView / grantEdit / revokeEdit / updatePermissions` 5개 도메인 메서드 구현.
- 서비스에서 `perm.updatePermissions(...)` 호출 — 필드 직접 mutation 없음.
- 비즈니스 규칙 (`edit ON → view 강제`, `view OFF → edit 강제 OFF`) 도메인 레이어에 캡슐화됨.
- `create()` 팩토리 이후 `updatePermissions()` 이중 호출(L218-219): 중복이지만 의미적으로 안전. 단순화 기회.

### [PASS] Spring SpEL bean 이름 정확성

- `@Service("dynamicPermission")` — SpEL `@dynamicPermission.canView(...)` 정합.
- `canView / canEdit / canAccess` 3개 메서드 모두 `@Transactional(readOnly = true)` 적용 — 읽기 트랜잭션 최적화.

### [PASS] @PreAuthorize MASTER 가드

- `PermissionAdminController`: `@PreAuthorize("hasRole('MASTER')")` 4개 메서드(GET 매트릭스 / PUT 단건 / POST batch / DELETE) 모두 적용.
- `/check` 엔드포인트: `@PreAuthorize("isAuthenticated()")` — 서비스 간 권한 조회용으로 타당.
- `SecurityConfig`: `/auth/admin/permissions/**` → `authenticated()` + 메서드 레벨 `@PreAuthorize` 이중 가드.

### [PASS] RestClient fallback (auth-service 장애 시 false)

- `DynamicPermissionClientImpl.checkPermission()`: `RestClientException` + 일반 `Exception` catch 블록에서 `false` 반환.
- 4xx (404 override 없음, 403 권한 없음) → `onStatus` 핸들러에서 예외 미발생, `null` 또는 정상 흐름으로 `false` 반환.
- 장애 격리 fallback 정책 정상.

### [PASS] V7 Flyway 순번 충돌 없음

- auth-service 마이그레이션: V1~V6 → V7 순번 연속, 충돌 없음.
- `CREATE TABLE IF NOT EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS` — 재실행 안전.
- `INSERT ... ON CONFLICT DO NOTHING` — idempotency 보장.

### [PASS] 84 row seed 정합

- V7 INSERT: MASTER(12) + MANAGER(12) + ACCOUNTANT(12) + SALES(12) + WAREHOUSE(12) + DISPATCH(12) + INVENTORY(12) = **84행**.
- 각 UUID seed: `d1000001-...-d1000007-...` prefix 패턴, 충돌 없음.
- 권한 배분 정책 (SP-03 §4.2): MASTER 전체 허용, MANAGER 대부분 view-only, ACCOUNTANT 회계 편집, SALES 영업 편집, WAREHOUSE 창고 편집, DISPATCH 배차 편집, INVENTORY 재고 유사.

### [PASS] 보수적 override 정책 (row 없으면 false)

- `canView / canEdit`: `.orElse(false)` 적용.
- `getPermissionMatrix()`: DB row 없는 조합 → `isOverride=false, canView=false, canEdit=false` fallback DTO 생성.

### [WARN-1] TaxInvoiceEmitService 동적 권한 판정 로직 취약점 (보안 잠재 이슈)

```java
// L95-97: DynamicPermissionClientImpl 2회 별도 호출
boolean dynamicAllowed = dynamicPermissionClient.canEdit(actorRole, EMIT_NTS_PAGE_CODE);
boolean overrideExists = dynamicPermissionClient.canView(actorRole, EMIT_NTS_PAGE_CODE)
        || dynamicAllowed;
if (overrideExists && !dynamicAllowed) { ... 403 }
```

**문제**: `canEdit()` / `canView()` 가 각각 독립적으로 auth-service HTTP 호출. 두 호출 사이 DB 상태가 변경되거나 첫 번째 호출은 실패 + 두 번째 호출은 성공할 경우 판정 불일치 가능.

**판정 논리 재검토**: `overrideExists = canView || canEdit`. `canEdit=false` + `canView=true` 인 경우에만 403이 맞음. 그러나 `canEdit=false` + `canView=false` (override row 있으나 양쪽 false, 또는 fallback) 도 `overrideExists=false` 로 처리되어 403이 발동되지 않음. 이는 의도된 설계이나 명시적 주석만으로 보안 보증이 약함.

**권고**: `/auth/admin/permissions/check` 단일 호출로 통합. `type=EDIT` 호출 1회로 `canEdit` 판정. override row 존재 여부는 별도 응답 필드로 수신하거나, 서비스 레이어에서 `getPermission(roleCode, pageCode)` 호출 1회로 `(canView, canEdit, isOverride)` 3필드 원자적 수신.

**Severity: WARN (기능 정상, 보안 강화 권장)**

### [WARN-2] PermissionAdminControllerTest — standaloneSetup @PreAuthorize 미검증

- `PermissionAdminControllerTest`: `standaloneSetup` 사용으로 `@PreAuthorize("hasRole('MASTER')")` 이 실제로 적용되지 않음 (테스트 자체도 주석으로 인정).
- T2 테스트 `getMatrix_withNoAuth_doesNotCallService()`: 인증 없이도 200 반환 → 403 검증이 실제로 이루어지지 않는 테스트.
- **비MASTER 403 차단 검증 부재** — `@SpringBootTest` 기반 SecurityIT 추가 권고.

**Severity: WARN (현 단위 테스트 범위 한계, 기능 자체 이상 없음)**

### [FAIL-1] domain-integrity-check.md 의 테이블명 / 컬럼명 불일치

- `domain-integrity-check.md`: 테이블명 `page_permission`, 컬럼명 `view_allowed / edit_allowed / updated_at / updated_by`
- 실제 DDL (V7): 테이블명 `role_page_permissions`, 컬럼명 `can_view / can_edit / modified_at / modified_by`
- SQL 쿼리 기준: `deleted_at IS NULL` (실제 엔티티 `is_deleted = false` + `deleted_at`).

**QA 문서의 SQL 스크립트 실행 시 전부 오류 발생.** 운영/QA 팀이 SQL을 그대로 실행하면 잘못된 검증 결과 초래.

**Severity: FAIL (문서 오류, 코드 동작 이상 없음 — 수정 필수)**

### [PASS] 한국어 Javadoc 의무 이행

- `RolePagePermission`, `PageCode`, `DynamicPermissionService`, `PermissionAdminController`, `RolePagePermissionRepository`, `DynamicPermissionClient`, `DynamicPermissionClientImpl`, `TaxInvoiceEmitService` 모두 한국어 Javadoc 작성 확인.

### [PASS] UUID 비공개 정책

- `PermissionDto` record: `id` 필드 없음. `roleCode + pageCode` 비즈니스 식별자만 응답 포함.
- `PermissionUpdateRequest`: `roleCode + pageCode` 기반 요청. UUID 미포함.

---

## 결함 요약

| ID | 분류 | Severity | 설명 |
|---|---|---|---|
| BE-1 | 로직 취약점 | WARN | TaxInvoiceEmitService 동적 권한 판정 시 2회 개별 HTTP 호출 — 원자적 단일 호출로 통합 권고 |
| BE-2 | 테스트 커버리지 | WARN | PermissionAdminControllerTest @PreAuthorize 비MASTER 403 미검증 |
| BE-3 | 문서 오류 | FAIL | domain-integrity-check.md 테이블명/컬럼명 불일치 (page_permission vs role_page_permissions 등) |

---

## 권장 Fix

1. **BE-3 (FAIL)**: `domain-integrity-check.md` SQL 내 `page_permission` → `role_page_permissions`, `view_allowed` → `can_view`, `edit_allowed` → `can_edit`, `updated_at` → `modified_at`, `updated_by` → `modified_by` 수정.
2. **BE-1 (WARN)**: `TaxInvoiceEmitService.emitNts()` 동적 권한 검증을 단일 `/check?type=EDIT` 호출로 통합. `isOverride` 플래그를 응답에 포함하여 override row 존재/부존재 판정.
3. **BE-2 (WARN)**: `PermissionAdminControllerTest` 에 `@WebMvcTest` + `@WithMockUser(roles="MANAGER")` 기반 403 케이스 추가 or 별도 SecurityIT 작성.
