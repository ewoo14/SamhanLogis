# SP-D1 동적 RBAC — Codex BE Cycle 1 Review

대상: PR #241, commit `1904b65e`  
범위: Section A + accounting-service POC cross-check  
결론: **merge blocker 있음. cycle 2 진입 권고.**

## Findings

### BLOCKER 1 — accounting-service 동적 권한 client 가 auth-service 응답 래퍼를 잘못 파싱해 POC 차단 로직이 사실상 동작하지 않음

- 위치:
  - `services/auth-service/src/main/java/com/samhanair/logis/auth/web/PermissionAdminController.java:137-142`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/DynamicPermissionClientImpl.java:61-75`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/TaxInvoiceEmitService.java:88-97`

auth-service `/auth/admin/permissions/check` 는 `ApiResponse.ok(new PermissionCheckResponse(allowed))` 이므로 실제 JSON 은 `data.allowed` 구조다. 그런데 accounting client 는 `.body(PermissionCheckResponse.class)` 로 루트의 `allowed` 를 읽는다. 결과적으로 정상 허용 응답도 `allowed=false` 로 해석될 가능성이 높다.

더 큰 문제는 `TaxInvoiceEmitService` 가 `canEdit=false` 를 곧바로 차단하지 않고 `canView || canEdit` 으로 override 존재를 추정한다는 점이다. client 파싱 실패나 auth-service 4xx/장애 시 `canView=false`, `canEdit=false` 가 되면 `overrideExists=false` 로 간주되어 기존 `@PreAuthorize` 만 통과하고 동적 차단은 무력화된다. 사용자 요구의 "DB override 매트릭스 신규 + 1개 페이지 POC" 가 실제 API enforce 로 검증되지 않는다.

권고: client 는 `ApiResponse<PermissionCheckResponse>` 형태를 파싱하거나 전용 DTO로 `data.allowed` 를 읽어야 한다. 또한 "row 없음"과 "명시적 deny"를 구분할 수 없는 현재 `/check` 응답으로는 override 존재 추정이 불가능하므로, POC 정책을 `false=차단`으로 단순화하거나 `isOverride` 포함 check 응답을 별도 설계해야 한다.

### BLOCKER 2 — FE/문서가 기대하는 권한 API 계약과 BE 계약이 서로 다름

- 위치:
  - `services/auth-service/src/main/java/com/samhanair/logis/auth/web/PermissionAdminController.java:44-99`
  - `services/auth-service/src/main/java/com/samhanair/logis/auth/service/DynamicPermissionService.java:123-148`
  - `clients/desktop/src/renderer/api/permissionsApi.ts:67-130`

BE는 `/auth/admin/permissions` 에서 `Map<String, Map<String, PermissionDto>>` 를 반환하고, batch 저장은 `POST /auth/admin/permissions/batch` 에 `permissions[]` 요청을 받는다. FE는 `/admin/permissions` 에서 `{ cells: [...] }` 를 기대하고, 저장은 `PUT /admin/permissions` 에 `{ updates: [...] }` 를 보낸다. 이 상태에서는 권한 매트릭스 화면이 실제 auth-service 와 통신할 수 없다.

권고: 하나의 API contract 를 확정하고 BE/FE/QA/mock/dev-report 를 모두 동기화해야 한다. 현 BE 형태를 유지한다면 FE `PermissionMatrix` 변환 로직과 `POST /batch` 요청 DTO를 맞춰야 한다.

### MAJOR 1 — MASTER "항상 전권 + 편집 불가"가 BE에서 강제되지 않음

- 위치:
  - `services/auth-service/src/main/resources/db/migration/V7__add_role_page_permissions.sql:61-73`
  - `services/auth-service/src/main/java/com/samhanair/logis/auth/service/DynamicPermissionService.java:135-136`
  - `services/auth-service/src/main/java/com/samhanair/logis/auth/service/DynamicPermissionService.java:198-245`

V7 seed 는 MASTER 12행을 실제 DB row 로 생성하고, service 는 MASTER를 matrix 대상에 포함한다. 하지만 `updatePermission`/`updatePermissionsBatch` 에서 `roleCode=MASTER` 변경을 차단하지 않는다. UI에서 MASTER 행을 static 표시하더라도 API 직접 호출로 MASTER의 동적 권한을 false 로 바꿀 수 있다.

권고: MASTER는 `canView/canEdit` 에서 항상 true 를 반환하거나, 적어도 update/delete 대상으로 거부해야 한다. seed 에 MASTER row 를 둘지 여부도 문서와 맞춰야 한다.

### MAJOR 2 — "row 없음 fallback=false"와 점진 마이그레이션 설명이 충돌함

- 위치:
  - `services/auth-service/src/main/java/com/samhanair/logis/auth/service/DynamicPermissionService.java:64-84`
  - `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/TaxInvoiceEmitService.java:84-97`

auth-service 자체는 row 없음이면 `false` 를 반환한다. 반면 POC 호출부는 row 없음 또는 auth-service 장애를 기존 `@PreAuthorize` 통과로 해석한다. 보안 fallback 요구는 "동적 권한 row 없으면 false"인데, accounting POC는 사실상 "row 없음이면 통과" 정책이다.

권고: SP-D1의 정확한 정책을 하나로 고정해야 한다. 보수 정책이면 `canEdit=false` 는 항상 403 이 되어야 하고, 점진 마이그레이션 호환이 목적이면 check 응답에 `isOverride` 를 포함해 "미등록"과 "명시 deny"를 구분해야 한다.

### MAJOR 3 — auth-service 보안 테스트가 MASTER 전용 method security를 검증하지 않음

- 위치:
  - `services/auth-service/src/test/java/com/samhanair/logis/auth/web/PermissionAdminControllerTest.java:47-89`

테스트가 `standaloneSetup` 기반이라 `@PreAuthorize` 가 적용되지 않음을 주석으로 인정한다. 실제 `/auth/admin/permissions` GET/PUT/POST/DELETE 가 비MASTER에게 403인지 검증하는 통합 테스트가 없다.

권고: `@SpringBootTest` 또는 WebMvc slice + method security 구성으로 MASTER, non-MASTER, unauthenticated 케이스를 추가해야 한다.

## Cross-Check

- `@Service("dynamicPermission")` bean 이름은 요구와 일치한다.
- `canView/canEdit` 의 row 없음 fallback false 는 auth-service 내부 구현 기준으로는 충족한다.
- `RolePagePermission.updatePermissions` 의 `edit ON -> view ON`, `view OFF -> edit OFF` 도메인 규칙은 충족한다.
- `DynamicPermissionClient` 는 `@MockBean` 으로 IT 격리되어 있으나, 실제 client contract 회귀 테스트가 없다.

## BE Decision

**APPROVE 불가. merge blocker 2건.**  
cycle 2에서는 API contract 통일, accounting POC 실제 차단 검증, MASTER 불변량 BE 강제, method security IT 보강이 필요하다.
