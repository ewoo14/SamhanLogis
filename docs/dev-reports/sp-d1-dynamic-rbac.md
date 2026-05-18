# SP-D1 동적 RBAC 권한 매트릭스 — Dev Report

> 작성일: 2026-05-18
> 담당 슬라이스: SP-D1 (Dynamic RBAC System)
> 브랜치: `feat/sp-d1-dynamic-rbac-system`

---

## 1. 슬라이스 개요

기존 하드코딩된 `@PreAuthorize("hasRole('MASTER')")` + `RoleGuard` 정적 권한 체계에
DB 기반 동적 RBAC 레이어를 추가하는 슬라이스.

**목표**: 마스터가 운영 중 UI 에서 역할별 페이지 접근 권한을 켜고 끌 수 있는 권한 매트릭스
편집 화면 + 사이드바 동적 표시 연동.

**범위**:
- BE: user-service 에 `page_permission` 테이블 + GET/PUT `/admin/permissions` + GET `/admin/permissions/my` endpoint
- FE: PermissionMatrixPage 신규 라우트 + usePermissions hook + AppLayout 동적 사이드바 연동
- QA: Playwright T1~T6 (6 TC) + IT cross-check 시나리오 3건
- DevOps: 동적 권한 시스템 ENV 불필요 (DB 기반) — 기존 user-service ENV 재사용

---

## 2. 점진 마이그레이션 전략

기존 121개 `@PreAuthorize` 어노테이션은 **미변경 유지**.

| 레이어 | 현재 (SP-D1 이전) | SP-D1 이후 |
|--------|------------------|------------|
| BE API 가드 | `@PreAuthorize("hasRole('X')")` 정적 | 동일 (121개 미변경) |
| FE 사이드바 | `canAccessXxx(auth.role)` 정적 함수 | `usePermissions().canAccess('PAGE')` 동적 |
| FE 라우트 진입 | `RoleGuard allow={ROLES_ARRAY}` 정적 | 추후 SP-D2 에서 동적 PermissionGuard 로 교체 |

**이중 검증 구조 (SP-D1 신규)**:
1. FE 사이드바: 동적 DB 권한 기반 표시/숨김
2. BE API: 기존 `@PreAuthorize` 정적 가드 (안전망)

SP-D2 에서 121개 `@PreAuthorize` 를 동적 권한 체크로 점진 교체 시작.
SP-D3 에서 full migration + legacy 정적 role 가드 제거.

---

## 3. BE 아키텍처

### 3-1. 신규 테이블: `page_permission`

```sql
CREATE TABLE page_permission (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code   VARCHAR(32) NOT NULL,           -- DEVELOPER / MANAGER / ...
  page_code   VARCHAR(64) NOT NULL,           -- DASHBOARD / SALES / ...
  view_allowed  BOOLEAN   NOT NULL DEFAULT FALSE,
  edit_allowed  BOOLEAN   NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMP   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP   NOT NULL DEFAULT now(),
  UNIQUE (role_code, page_code)
);
```

### 3-2. 신규 endpoint (user-service)

| Method | Path | 권한 | 설명 |
|--------|------|------|------|
| GET | `/admin/permissions` | MASTER | 전체 7×12 매트릭스 조회 |
| PUT | `/admin/permissions` | MASTER | batch update (원자성 트랜잭션) |
| GET | `/admin/permissions/my` | 인증된 모든 역할 | 현재 사용자 권한 목록 |

### 3-3. 원자성 보장

PUT `/admin/permissions` 는 단일 `@Transactional` 내에서 `updates` 배열 전체를
upsert. 1건 실패 시 전체 롤백.

### 3-4. 기존 121 @PreAuthorize 미변경

SP-D1 에서는 BE 신규 endpoint 만 추가. 기존 서비스 endpoint `@PreAuthorize` 는 그대로.
→ 기존 IT (통합테스트) 에 **회귀 없음**.

---

## 4. FE 흐름

```
AppLayout
  └── usePermissions()  [hook — TanStack Query 5분 캐시]
        └── GET /admin/permissions/my
        └── setPermissionsCache(perms)  [동기 canAccess() 캐시 갱신]
  └── SidebarLink show={canAccess('PURCHASES')}  [동적 사이드바]

PermissionMatrixPage  [/admin/permission-matrix — MASTER 전용]
  └── fetchPermissionMatrix()  [GET /admin/permissions]
  └── <PermissionMatrixTable />  [7역할 × 12페이지 grid]
        └── 체크박스 토글 → pendingChanges state
        └── "변경 사항 N건" + 저장 버튼 활성화
  └── handleSave()  [PUT /admin/permissions + 재조회 + toast]
```

---

## 5. DB 스키마

`page_permission` 테이블 seed (Flyway V_SPD1_001):

- 역할 7개: DEVELOPER / MANAGER / DISPATCH / SALES / ACCOUNTANT / WAREHOUSE / INVENTORY
- 페이지 12개: DASHBOARD / WAREHOUSES / SALES / PURCHASES / TRANSFERS / ACCOUNTING /
  AROLOGIS / WAREHOUSE_OPS / ADMIN / DISPATCH_BOARD / PERMISSION_MATRIX / REPORTS
- 기본값: 역할별 SP-09 매트릭스 기준 (ACCOUNTANT → ACCOUNTING view+edit 등)

---

## 6. 권한 매트릭스 (SP-09 seed 기준)

| 역할 | DASHBOARD | SALES | PURCHASES | ACCOUNTING | ADMIN | PERMISSION_MATRIX |
|------|-----------|-------|-----------|------------|-------|------------------|
| DEVELOPER | O | O | O | O | O | O |
| MANAGER | O | O | O | O | O | X |
| DISPATCH | O | X | X | X | X | X |
| SALES | O | O | X | X | X | X |
| ACCOUNTANT | O | X | X | O | X | X |
| WAREHOUSE | O | X | O | X | X | X |
| INVENTORY | O | X | X | X | X | X |

`O` = view 허용, `X` = 미허용. `edit` 권한은 별도 컬럼.

---

## 7. IT 시나리오 (BE 구현 후 검증)

### 7-1. 동적 권한 grant → 허용 시나리오

```
1. 초기 상태: SALES × PURCHASES view=false
2. MASTER 로 PUT /admin/permissions { updates: [{roleCode: SALES, pageCode: PURCHASES, action: view, allowed: true}] }
3. SALES 로 GET /admin/permissions/my → PURCHASES: view 포함 확인
4. 기존 @PreAuthorize 는 미변경 → SALES 의 /slips/... endpoint 는 여전히 @PreAuthorize 로 차단
   (FE 사이드바 노출 + BE API 차단 공존 — SP-D2 에서 BE 동적화)
```

### 7-2. batch update 원자성 — 1건 실패 시 전체 롤백

```
1. PUT /admin/permissions updates 배열에 유효 2건 + 유효하지 않은 pageCode 1건 포함
2. 전체 롤백 확인 — 유효 2건도 미저장
3. DB 상태 이전과 동일 확인
```

### 7-3. 마스터 외 403 가드

```
1. MANAGER 로 GET /admin/permissions → 403 ACCESS_DENIED
2. MANAGER 로 PUT /admin/permissions → 403 ACCESS_DENIED
3. 일반 사용자로 GET /admin/permissions/my → 200 (자기 권한만)
```

---

## 8. Playwright 시나리오 (6건)

| TC | 시나리오 | 검증 핵심 |
|----|----------|-----------|
| T1 | 마스터 권한 매트릭스 진입 + grid 표시 | 체크박스 84개 이상, 7역할 헤더, 12페이지 행 |
| T2 | SALES OCR 체크박스 토글 | 변경 사항 1건 + 저장 버튼 활성화 |
| T3 | 저장 → toast 성공 + 매트릭스 재갱신 | GET 2회 이상 호출, 체크박스 상태 갱신 |
| T4 | SALES OCR grant 후 사이드바 표시 | sidebar-purchases-receipt-ocr visible, disabled X |
| T5 | 존재하지 않는 URL → 404 | disabled 오버레이 X, 404/로그인 redirect |
| T6 | MANAGER 권한 매트릭스 진입 → 403 | forbidden-page 또는 /forbidden redirect |

spec 경로: `clients/desktop/playwright/sp-d1-dynamic-rbac/sp-d1-dynamic-rbac.spec.ts`

---

## 9. 회귀 영향

### 기존 IT 영향 없음
- 121개 `@PreAuthorize` 미변경 → 기존 IT 전부 그린 유지
- user-service 신규 테이블/endpoint 추가이므로 기존 endpoint 응답 변화 없음

### SP-09 4 vendor 권한 매트릭스 호환
- SP-09 T3 (4 vendor 권한 매트릭스 cross-check) 에서 검증한 역할별 접근 규칙이
  SP-D1 page_permission seed 의 기본값과 일관되어야 함
- ACCOUNTANT → NTS/KFTC 허용, SALES → 차단 규칙 = seed 기본값 반영 필요

### AppLayout 동적 사이드바 점진 전환
- 기존 `canAccessXxx(auth.role)` 정적 함수는 즉시 삭제하지 않음
- usePermissions hook 과 병렬 사용하다가 SP-D2 에서 점진 교체

---

## 11. Designer Cycle 2 Fix (2026-05-18)

| ID | 결함 | 상태 | Fix 내용 |
|---|------|------|---------|
| D-1 | dirty 셀 3px amber 마커 미구현 | FIXED | mock 02 CSS `::before` 색상 `#F59E0B` 명시, TSX `borderLeft: 3px solid` 추가 |
| D-3 | sticky z-index 충돌 | FIXED | TSX `thead` z-index:30, `th.th-role` z-index:40, `td.td-role` z-index:20 정렬 |
| D-4 | 접근성 미적용 | FIXED | TSX `<th scope="col">` + `<td scope="row">` + `role="alert"` + `role="status" aria-live="polite"` |
| D-6 | AROLOGIS 표기 | FIXED | Cycle 2 linter fix — `PAGE_LABEL` 이 BE dot-separated 체계로 전면 교체되어 `AROLOGIS` 키 해소. 향후 신규 아로로지스 PageCode 시 `'아로로지스'` 라벨 의무 |

수정 파일:
- `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`
- `docs/qa/sp-d1-dynamic-rbac/screenshots/01-permission-matrix-default.html`
- `docs/qa/sp-d1-dynamic-rbac/screenshots/02-permission-matrix-edited.html`
- `docs/design/sp-d1-dynamic-rbac/decisions.md` (cycle 2 결정 + API contract 동기화)

---

## 10. 후속 슬라이스 (SP-D2 / SP-D3)

### SP-D2: 121 @PreAuthorize 점진 마이그레이션 (Phase 1 — 40개)
- 높은 역할 변경 빈도 endpoint 우선 (슬립/주문 CRUD)
- `@PreAuthorize` → 동적 권한 체크 `permissionService.checkAccess(userId, pageCode, action)`
- 기존 IT 를 동적 권한 기반으로 재작성

### SP-D3: full migration + legacy 제거
- 나머지 81개 @PreAuthorize 교체
- `canAccessXxx()` 정적 함수 일괄 제거
- RoleGuard 컴포넌트 → PermissionGuard 로 교체
- 전체 IT/Playwright 회귀 검증
