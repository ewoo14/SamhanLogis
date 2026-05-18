# SP-D1 동적 RBAC — Codex FE Cycle 1 Review

대상: PR #241, commit `1904b65e`  
범위: Section B + BE contract cross-check  
결론: **merge blocker 있음. cycle 2 진입 권고.**

## Findings

### BLOCKER 1 — FE 권한 API가 BE endpoint/DTO와 전혀 맞지 않아 권한 매트릭스 화면이 실제 서버와 연결되지 않음

- 위치:
  - `clients/desktop/src/renderer/api/permissionsApi.ts:67-130`
  - `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx:121-164`
  - `services/auth-service/src/main/java/com/samhanair/logis/auth/web/PermissionAdminController.java:44-99`

FE는 `GET /admin/permissions -> { cells, generatedAt }`, `PUT /admin/permissions -> { updates }`, `GET /admin/permissions/my` 를 전제로 한다. BE는 `/auth/admin/permissions`, `/auth/admin/permissions/batch`, 중첩 Map 응답, `permissions[]` DTO를 제공한다. 실제 app에서는 matrix load/save/my-permissions가 모두 실패한다.

권고: gateway prefix 포함 최종 URL, 응답 shape, batch update method/body를 한 contract로 맞춰야 한다.

### BLOCKER 2 — PageCode 체계가 BE와 불일치함

- 위치:
  - `clients/desktop/src/renderer/api/permissionsApi.ts:38-52`
  - `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx:63-103`
  - `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java:21-67`

FE는 `DASHBOARD`, `PURCHASES`, `PERMISSION_MATRIX` 같은 대문자 카테고리 코드를 사용한다. BE는 `accounting.tax-invoice.emit-nts`, `purchases.receipt-ocr`, `admin.permissions` 같은 dot-separated 페이지 코드를 검증한다. FE에서 저장하는 값은 BE `PageCode.isValid` 를 통과하지 못한다.

권고: SP-D1 POC가 12개 dot page code 기준이면 FE 타입/라벨/seed/mock/Playwright를 BE `PageCode`와 1:1로 바꿔야 한다.

### BLOCKER 3 — 동적 PermissionGuard가 실제 라우트에 적용되지 않음

- 위치:
  - `clients/desktop/src/renderer/components/PermissionGuard.tsx:34-49`
  - `clients/desktop/src/renderer/routes/index.tsx:69`
  - `clients/desktop/src/renderer/routes/index.tsx:1110-1114`

`PermissionGuard`는 새로 추가됐지만 routes 에서는 import/use 되지 않고, 권한 매트릭스 포함 대부분 라우트가 여전히 `RoleGuard` 를 사용한다. 사용자 요구의 "마스터가 페이지별 체크박스 동적 권한 부여"가 FE route access에는 반영되지 않는다.

권고: 최소 POC 페이지에 `PermissionGuard pageCode="accounting.tax-invoice.emit-nts"` 또는 확정 pageCode를 적용하고, 정적 `RoleGuard`와 동작 우선순위를 명시해야 한다.

### MAJOR 1 — 사이드바 hidden이 동적 권한이 아니라 기존 정적 role 함수에 의존함

- 위치:
  - `clients/desktop/src/renderer/components/AppLayout.tsx:84-99`
  - `clients/desktop/src/renderer/components/AppLayout.tsx:235-271`
  - `clients/desktop/src/renderer/components/AppLayout.tsx:927-954`

`SidebarLink` 자체는 `show=false` 일 때 `return null` 이라 hidden 정책은 좋다. 하지만 `showAdmin`, `showReceiptOcr`, `showDispatchBoard` 등 대부분의 `show` 값은 `usePermissions`가 아니라 기존 정적 role helper/상수에서 온다. 따라서 DB에서 권한을 바꿔도 실제 사이드바는 즉시 반영되지 않는다.

권고: POC 범위의 메뉴 하나라도 `usePermissions().canAccess(pageCode)`로 전환하고, 권한 revoke 시 DOM에서 제거되는 테스트를 추가해야 한다.

### MAJOR 2 — PermissionGuard의 unauthorized 처리가 "진짜 404"가 아님

- 위치:
  - `clients/desktop/src/renderer/components/PermissionGuard.tsx:47-49`

권한 없음이면 `<Navigate to="/" replace />` 로 홈 URL로 바꾼다. 사용자가 지적한 대로 URL bar가 root로 변경되며, 실제 404/NotFound 효과가 아니다. 또한 홈 화면으로 조용히 이동하면 권한 차단 여부를 QA가 식별하기 어렵다.

권고: hidden 정책과 별개로 direct URL 접근은 NotFound 또는 ForbiddenPage 중 하나로 명확히 렌더해야 한다. "존재하지 않는 것처럼" 처리하려면 URL 유지형 404 컴포넌트가 더 적절하다.

### MAJOR 3 — test id가 구현과 Playwright 간 불일치함

- 위치:
  - `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx:495-515`
  - `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx:303-311`
  - `clients/desktop/playwright/sp-d1-dynamic-rbac/sp-d1-dynamic-rbac.spec.ts:478-480`
  - `clients/desktop/playwright/sp-d1-dynamic-rbac/sp-d1-dynamic-rbac.spec.ts:549`

구현은 `permission-view-{role}-{page}`, `permission-edit-{role}-{page}`, `permission-save-btn`를 사용한다. Playwright는 `permission-matrix-cell-SALES-PURCHASES-view`, `permission-matrix-save-btn`를 찾는다. fallback이 많아도 핵심 data-testid 기반 검증이 실제 구현을 정확히 잡지 못한다.

## Cross-Check

- 메뉴 hidden 방식 자체는 `SidebarLink`의 `return null`로 회색 비활성화 금지 요구를 만족한다.
- MASTER 행은 FE 화면에서 static 표시 + 체크박스 없음으로 편집 불가처럼 보이지만, BE API에서 MASTER 변경이 막히지 않는다.
- `edit ON -> view ON`, `view OFF -> edit OFF` 로컬 토글 규칙은 구현되어 있다.

## FE Decision

**APPROVE 불가.**  
FE는 현재 mock/spec 전용 contract에 맞춰져 있고 실제 BE contract 및 동적 route/sidebar 연결이 빠져 있다. cycle 2에서 contract 재정렬 후 POC 메뉴/라우트 하나를 end-to-end로 연결해야 한다.
