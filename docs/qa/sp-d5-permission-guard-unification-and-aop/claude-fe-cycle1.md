# SP-D5 FE cycle 1 리뷰 — claude-fe-cycle1.md

작성일: 2026-05-19
슬라이스: SP-D5 (BE PermissionGuard 단일화 + AOP + Metrics)
검토자: FE agent (Claude)
판정: **APPROVE**

---

## 총평

SP-D5 는 BE 전용 인프라 슬라이스(shared/security, 각 서비스별 DynamicPermissionClient, AOP, Micrometer Metrics)이다. `git diff origin/main..HEAD -- clients/` 결과 변경 파일 0건으로 FE 코드 변경 없음이 확인되었다.

---

## 검증 항목별 결과

### (1) FE 코드 변경 0 검증
- `clients/` 하위 변경 파일: **0건 (정상)**
- PR 변경 파일 목록은 `shared/security/`, `services/*/client/DynamicPermissionClient.java`, `services/*/report/*Controller.java`, `infrastructure/`, `docs/` 만 포함. clients/ 진입 없음.

결함 없음.

### (2) PermissionMatrixPage 회귀 가능성
- `PermissionMatrixPage.tsx` 가 호출하는 API path(`GET /auth/admin/permissions`, `POST /auth/admin/permissions/batch`, `GET /auth/admin/permissions/my`) 는 SP-D5 변경 대상이 아니다. SP-D5 는 accounting-service, inventory-service 등의 controller 에 `@RequirePermission` AOP 를 적용하는 변경이며 auth-service 권한 API path 자체는 수정하지 않는다.
- `@RequirePermission(page = "inventory.warehouse", action = "VIEW")` 형식의 page 코드는 FE `PageCode` 타입에 `'inventory.warehouse'` 로 정의되어 있어 일치한다. SP-D5 가 신규 PageCode 를 추가하지 않으므로 FE PageCode 타입 추가 불필요.

결함 없음.

### (3) usePermissions hook 회귀
- `usePermissions.ts` 는 `fetchMyPermissions()` → `GET /auth/admin/permissions/my` → `PermissionDto(canView/canEdit)` 변환 흐름을 유지한다. SP-D5 는 이 응답 shape 에 영향을 주지 않는다.
- `staleTime: 5분`, `canAccess(pageCode, action)` 시그니처, `setPermissionsCache` 헬퍼 — 모두 변경 없음.

결함 없음.

### (4) 403 응답 envelope 일관성
- SP-D5 `PermissionAspect` 는 deny 시 `AccessDeniedException` 을 throw 한다.
- 각 서비스의 `GlobalExceptionHandler` 는 `@ExceptionHandler(AccessDeniedException.class)` 를 보유하며 `ResponseEntity.status(ErrorCode.FORBIDDEN.getHttpStatus()).body(ApiResponse.fail(ErrorCode.FORBIDDEN, ...))` 형식으로 응답한다. 이는 기존 Spring Security `@PreAuthorize` 403 경로(SecurityFilterChain AccessDeniedHandler → GlobalExceptionHandler) 와 동일한 `ApiResponse<Void>` envelope 이다.
- FE `apiClient.ts` 인터셉터는 401 만 별도 처리하며 403 은 `Promise.reject` 로 전파한다. 기존 동작 그대로이다.

결함 없음.

### (5) fe-impact-zero.md 검증
- 파일 위치: `docs/qa/sp-d5-permission-guard-unification-and-aop/fe-impact-zero.md`
- 항목별 명시 여부:
  - (1) PermissionMatrixPage API path 회귀: 명시됨
  - (2) usePermissions hook 회귀: 명시됨
  - (3) Sidebar(AppLayout) 회귀: 명시됨 (검증 (3) 범위 포함)
  - (4) 403 응답 envelope 일관성: 명시됨 (`client.ts` 인터셉터 동작, AccessDeniedException 처리 일치 설명 포함)
  - (5) 신규 컴포넌트 작성 금지 확인: 명시됨
- 잠재 리스크 표(5개 항목)도 포함되어 있어 충분한 근거를 제공한다.

결함 없음.

---

## 결함 목록

결함 없음.

---

## 판정

**APPROVE**

SP-D5 PR 은 BE 인프라 전용 변경이며 FE 코드 변경 0, API contract 유지, 403 envelope 일관성 모두 확인되었다. FE 회귀 리스크 없음.
