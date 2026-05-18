# SP-D1 동적 RBAC — Codex QA Cycle 1 Review

대상: PR #241, commit `1904b65e`  
범위: Section D + E2E/문서 검증 정합성  
결론: **QA gate 불충분. cycle 2 진입 권고.**

## Findings

### BLOCKER 1 — Playwright가 실제 BE contract를 검증하지 않고 mock-only contract를 검증함

- 위치:
  - `clients/desktop/playwright/sp-d1-dynamic-rbac/sp-d1-dynamic-rbac.spec.ts:33-35`
  - `clients/desktop/playwright/sp-d1-dynamic-rbac/sp-d1-dynamic-rbac.spec.ts:278-292`
  - `clients/desktop/playwright/sp-d1-dynamic-rbac/sp-d1-dynamic-rbac.spec.ts:603-631`

테스트는 `/admin/permissions`, `{ cells }`, `{ updates }`, `/admin/permissions/my` 를 route fulfill로 직접 모킹한다. 실제 BE는 `/auth/admin/permissions`, nested Map, `POST /batch` 요청이다. 따라서 T1~T6가 통과해도 실제 PR 기능이 동작한다는 증거가 아니다.

권고: 최소 contract test 한 개는 mock route 없이 실제 FE API adapter가 BE DTO와 맞는지 검증해야 한다. mock 테스트를 유지하더라도 BE contract와 동일한 응답/요청 shape로 고쳐야 한다.

### BLOCKER 2 — 테스트 셀렉터가 구현과 달라 핵심 상호작용을 우회할 수 있음

- 위치:
  - `clients/desktop/playwright/sp-d1-dynamic-rbac/sp-d1-dynamic-rbac.spec.ts:478-506`
  - `clients/desktop/playwright/sp-d1-dynamic-rbac/sp-d1-dynamic-rbac.spec.ts:549-568`
  - `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx:495-515`
  - `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx:303-311`

테스트는 `permission-matrix-cell-SALES-PURCHASES-view`, `permission-matrix-save-btn`를 찾지만 구현은 `permission-view-SALES-PURCHASES`, `permission-save-btn`를 사용한다. fallback은 실패를 명확히 하지 않고 텍스트 기반으로 넘어가므로, 실제 checkbox/save 버튼이 동작하지 않아도 일부 단계가 약하게 통과할 수 있다.

권고: data-testid를 구현 기준으로 통일하고 fallback을 제거하거나, fallback 경로에서도 명확한 실패를 보장해야 한다.

### MAJOR 1 — T5가 "권한 없는 URL 직접 진입"이 아니라 "존재하지 않는 URL"을 검증함

- 위치:
  - `clients/desktop/playwright/sp-d1-dynamic-rbac/sp-d1-dynamic-rbac.spec.ts:116`
  - `clients/desktop/playwright/sp-d1-dynamic-rbac/sp-d1-dynamic-rbac.spec.ts:860-937`

요구는 권한 없는 실제 페이지 직접 진입 차단이다. T5는 `/admin/nonexistent-page-xyz-404` 로 존재하지 않는 route를 열어 HashRouter 404 또는 로그인 redirect를 허용한다. 동적 RBAC의 direct URL 차단을 검증하지 않는다.

권고: 권한이 없는 실제 등록 라우트(`/admin/permission-matrix` 등)를 대상으로 PermissionGuard/RoleGuard/BE 차단 결과를 검증해야 한다.

### MAJOR 2 — 도메인 정합성 SQL 문서가 실제 DB 스키마와 맞지 않음

- 위치:
  - `docs/qa/sp-d1-dynamic-rbac/domain-integrity-check.md:8-16`
  - `docs/qa/sp-d1-dynamic-rbac/domain-integrity-check.md:73-83`
  - `services/auth-service/src/main/resources/db/migration/V7__add_role_page_permissions.sql:12-26`

문서는 `page_permission`, `view_allowed`, `edit_allowed`, `updated_at`, `deleted_at` 를 검증한다. 실제 migration은 `role_page_permissions`, `can_view`, `can_edit`, `modified_at`, `is_deleted` 다. 문서 SQL을 실행하면 실패하거나 잘못된 테이블을 검증한다.

권고: domain-integrity-check를 실제 migration 스키마로 교정하고, MASTER row 존재 여부 기대값도 실제 정책과 맞춰야 한다.

### MAJOR 3 — dev-report가 구현 사실과 다름

- 위치:
  - `docs/dev-reports/sp-d1-dynamic-rbac.md:18-21`
  - `docs/dev-reports/sp-d1-dynamic-rbac.md:46-67`
  - `docs/dev-reports/sp-d1-dynamic-rbac.md:102-121`

dev-report는 user-service, `page_permission`, `/admin/permissions/my`, `DEVELOPER` role 등을 기록한다. 실제 구현은 auth-service, `role_page_permissions`, `/auth/admin/permissions/check`, `MASTER` 포함 seed다. 3-layer 문서화 산출물이 현재 코드를 설명하지 못한다.

## Coverage Gaps

- "명시 deny row가 있으면 accounting emit-nts 403" IT가 없다.
- "auth-service 장애 시 fallback 정책" 테스트가 없다.
- "MASTER row/API mutation 불가" 테스트가 없다.
- "DB 권한 revoke 후 사이드바 DOM 미렌더" 실 구현 테스트가 없다.

## QA Decision

**APPROVE 불가.**  
현재 QA는 화면 mock과 문서 시나리오 중심이고, 실제 BE/FE contract 및 동적 권한 enforce를 검증하지 못한다. cycle 2에서 contract 기반 E2E/IT를 재작성해야 한다.
