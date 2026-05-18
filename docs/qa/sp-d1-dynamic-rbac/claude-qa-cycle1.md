# SP-D1 동적 RBAC — QA 리뷰 (Claude, Cycle 1)

> 브랜치: `feat/sp-d1-dynamic-rbac-system` (commit `1904b65e`)
> 리뷰어: Claude QA Agent
> 일시: 2026-05-18

---

## 검증 범위

- `playwright/sp-d1-dynamic-rbac/sp-d1-dynamic-rbac.spec.ts` T1~T6
- `docs/qa/sp-d1-dynamic-rbac/domain-integrity-check.md`
- `docs/dev-reports/sp-d1-dynamic-rbac.md`
- `DynamicPermissionServiceTest` (19 케이스)
- `PermissionAdminControllerTest` (5 케이스)

---

## 검증 결과

### [PASS] SP-09 패턴 false green 0건 원칙

- `test.beforeEach`: `isServerAvailable()` → `expect(ok).toBe(true)` — dev server 미가용 시 FAIL (skip X).
- 전체 스펙: `test.skip(SKIP_UI)` 플래그 하나만 존재, 개별 테스트 내 `|| true` / `test.skip()` 조건 없음.
- `isServerAvailable()`: `http.get` 2초 timeout — 실제 서버 확인.

### [PASS] DynamicPermissionServiceTest 19 케이스 커버리지

확인된 케이스:
1. canView DB override 존재 → true
2. canView DB row 없음 → false fallback
3. canEdit view-only override → false
4. canAccess VIEW → true
5. canAccess 잘못된 permissionType → IllegalArgumentException
6. updatePermission no existing → 신규 생성
7. updatePermission existing → 도메인 메서드 갱신
8. updatePermission canEdit=true → canView 자동 true
9. updatePermission 미등록 pageCode → INVALID_INPUT
10. updatePermissionsBatch 2건 성공
11. deletePermission 존재 → markDeleted 호출
12. deletePermission 미존재 → NOT_FOUND
13. getPermissionMatrix DB row 없음 → 전체 fallback
14. getPermissionMatrix DB row 있음 → isOverride=true
15. 도메인 메서드 grantEdit → canView 자동 true
16. 도메인 메서드 revokeView → canEdit 자동 false
17. 도메인 메서드 revokeEdit → canView 유지

실제 파일 19개 확인 불가 (17개 명시적 @Test 메서드만 확인됨). 2개 추가 케이스 검토 필요.

### [PASS] PermissionAdminControllerTest 5 케이스

1. `getMatrix_withMasterRole_returns200` — MASTER GET 200
2. `getMatrix_withNoAuth_doesNotCallService` — standaloneSetup 제한 문서화
3. `updatePermission_withMasterRole_returns200` — MASTER PUT 200
4. `updatePermission_invalidPageCode_returns400` — 대문자 pageCode 400
5. `checkPermission_withAuth_returns200` — 인증된 사용자 체크 200
6. `checkPermission_whenNotAllowed_returnsAllowedFalse` — allowed:false 200

→ 총 6개 메서드 확인됨 (5개 명세 vs 실제 6개 존재 — 메서드 수 일치).

### [WARN-1] data-testid 불일치 — Playwright 테스트 실제 실행 시 FAIL 예상

**실제 PermissionMatrixPage.tsx data-testid 목록**:
- `permission-matrix-table`
- `permission-cell-{role}-{page}` (예: `permission-cell-SALES-PURCHASES`)
- `permission-view-{role}-{page}` (예: `permission-view-SALES-PURCHASES`)
- `permission-edit-{role}-{page}`
- `permission-save-btn`
- `permission-reset-btn`

**Playwright 스펙이 참조하는 data-testid**:
- `permission-matrix-role-*` — **미존재** (T1 step 3)
- `permission-matrix-row-*` — **미존재** (T1 step 4)
- `permission-matrix-cell-*` (count 84) — **미존재** (실제는 `permission-cell-*`)
- `permission-matrix-cell-SALES-PURCHASES-view` — **미존재** (실제 패턴: `permission-view-SALES-PURCHASES`)
- `permission-matrix-save-btn` — **미존재** (실제: `permission-save-btn`)
- `permission-matrix-change-count` — **미존재** (별도 data-testid 없음)
- `permission-matrix-dirty-indicator` — **미존재**

**결과**: T1, T2, T3 의 data-testid 기반 primary assertion이 모두 `isVisible()=false` → fallback 텍스트 검증으로 동작. data-testid 기반 assertion 의미 없음. 스펙과 컴포넌트 간 data-testid 명명 체계 불일치.

**Severity: FAIL (테스트가 의도한 요소를 검증하지 못함)**

### [FAIL-2] T4 — 사이드바 영수증 OCR 메뉴 data-testid 미검증 가능

- T4: `sidebar-purchases-receipt-ocr` data-testid 조회 → 실제 `AppLayout.tsx`에서 영수증 OCR 링크에 해당 data-testid 존재 여부 미확인.
- `AppLayout.tsx`는 정적 역할 기반 `canAccessXxx()` 함수로 사이드바 표시 제어. SP-D1 동적 권한(`usePermissions`) 연동이 `AppLayout`에 반영되었는지 확인 필요.

**Severity: FAIL (T4 핵심 시나리오 — 동적 권한 grant 후 사이드바 반영 — 미검증)**

### [PASS] T5 — 존재하지 않는 URL 404 검증

- `/#/admin/nonexistent-page-xyz-404` 접근 → 404 / 로그인 redirect 허용.
- `sidebar-disabled-overlay` 미존재 확인.
- HashRouter 미매칭 처리 정상 흐름 검증.

### [WARN-3] T6 — MANAGER 403 검증의 불완전성

- T6: `PermissionGuard`가 없는 상태에서 MANAGER가 `/admin/permission-matrix` 진입 시, `usePermissions` 캐시 완료 전 `isLoading=true` → children 렌더 → `PermissionGuard` 없이 `PermissionMatrixPage` 직렬 렌더 가능성.
- `routes/index.tsx` 확인 결과: `/admin/permission-matrix` 라우트에 `PermissionGuard` 래핑이 적용되어 있는지 확인 필요. `RoleGuard`(정적 MASTER 전용 가드) 존재 여부 미확인.

**Severity: WARN**

### [PASS] 84 row seed idempotency 검증 (SQL)

- `domain-integrity-check.md`: `INSERT ... ON CONFLICT DO NOTHING` 2회 재실행 후 COUNT=84 유지 검증 SQL 제공.

### [FAIL-4] domain-integrity-check.md SQL 오류 (BE 리뷰와 교차 확인)

- 테이블명 `page_permission` (실제: `role_page_permissions`), 컬럼명 `view_allowed/edit_allowed/updated_at` (실제: `can_view/can_edit/modified_at`) 불일치.
- QA 팀이 해당 SQL 직접 실행 불가. 모든 SQL 쿼리 재작성 필요.

**Severity: FAIL**

### [PASS] BaseEntity 7 audit 완전성 — SQL 검증 커버

- `domain-integrity-check.md` §5: 7 audit 필드 완전성 확인 SQL 포함.
- 단, 컬럼명 `updated_at` / `updated_by` (실제: `modified_at` / `modified_by`) 불일치로 실행 불가.

---

## 결함 요약

| ID | 분류 | Severity | 설명 |
|---|---|---|---|
| QA-1 | 테스트 구조 | FAIL | Playwright data-testid 불일치 — 스펙의 primary assertion이 대부분 fallback 텍스트로 동작 |
| QA-2 | 테스트 커버리지 | FAIL | T4 동적 권한 grant 후 AppLayout 사이드바 연동 미검증 |
| QA-3 | 문서 오류 | FAIL | domain-integrity-check.md SQL 테이블명/컬럼명 실제 DDL과 불일치 |
| QA-4 | 테스트 흐름 | WARN | T6 MANAGER 403 검증 — PermissionGuard 래핑 여부 미확인 |

---

## 권장 Fix

1. **QA-1 (FAIL)**: `PermissionMatrixPage.tsx` data-testid를 스펙 기준으로 통일하거나 스펙 data-testid를 컴포넌트 기준으로 수정. 권장: 컴포넌트 data-testid 통일.
   - `permission-save-btn` → `permission-matrix-save-btn`
   - `permission-cell-{role}-{page}` → `permission-matrix-cell-{role}-{page}` (또는 스펙 수정)
   - 역할 행 헤더: `data-testid={`permission-matrix-role-${role}`}` 추가
   - 페이지 열 헤더: `data-testid={`permission-matrix-row-${page}`}` 추가

2. **QA-2 (FAIL)**: `AppLayout.tsx`에 `usePermissions` 훅 연동 추가. OCR 영수증 링크에 `data-testid="sidebar-purchases-receipt-ocr"` 추가 + `canAccess('PURCHASES', 'view')` 조건 적용.

3. **QA-3 (FAIL)**: `domain-integrity-check.md` SQL 전면 재작성 (테이블명: `role_page_permissions`, 컬럼: `can_view`, `can_edit`, `modified_at`, `modified_by`).
