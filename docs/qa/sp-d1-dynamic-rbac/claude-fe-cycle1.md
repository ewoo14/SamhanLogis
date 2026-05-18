# SP-D1 동적 RBAC — FE 리뷰 (Claude, Cycle 1)

> 브랜치: `feat/sp-d1-dynamic-rbac-system` (commit `1904b65e`)
> 리뷰어: Claude FE Agent
> 일시: 2026-05-18

---

## 검증 범위

- `api/permissionsApi.ts`
- `hooks/usePermissions.ts`
- `components/PermissionGuard.tsx`
- `components/AppLayout.tsx` (SidebarLink 컴포넌트 — hidden 정책)
- `routes/PermissionMatrixPage.tsx`
- `routes/index.tsx` (PermissionMatrixPage 라우트 등록)
- `api/mock.ts` (SP-D1 mock 구현)

---

## 검증 결과

### [PASS] 사이드바 hidden — `return null` 완전 미렌더

- `SidebarLink` 컴포넌트: `if (!show) return null` 처리. DOM에 렌더되지 않아 회색 비활성 표시 X.
- SP-D1 요구사항 (`feedback_multi_agent_team_pattern.md` 설계 결정) 정확히 이행.

### [PASS] PermissionGuard Navigate replace 처리

- `PermissionGuard`: `<Navigate to="/" replace />` — 히스토리 스택 오염 없이 홈 redirect.
- 로딩 중 (`isLoading=true`) → `<>{children}</>` 통과 (깜박임 방지). 의도된 보수적 허용.

### [PASS] UUID 비공개 정책

- `permissionsApi.ts`: 타입 `PermissionCell`, `PermissionMatrix`, `PermissionUpdateItem` 모두 `roleCode / pageCode` 비즈니스 식별자만 사용. UUID 노출 없음.

### [PASS] dirty 체크박스 강조 (amber)

- `PermissionMatrixPage`: `isDirty` → `background: 'var(--color-warning-50)'` + border warning-200. amber 톤 강조.
- dirty 배너: 변경된 셀 수 카운터 노출. 저장 버튼에도 `(N건)` 카운트 표시.

### [PASS] view/edit 일관성 (edit ON → view 강제, view OFF → edit 강제 OFF)

```typescript
// PermissionMatrixPage.tsx L200-205
if (field === 'view' && !updated.view) { updated.edit = false }
if (field === 'edit' && updated.edit) { updated.view = true }
```
- FE 레이어에서 도메인 규칙 미러링 확인.

### [PASS] MASTER 행 항상 전권 + 편집 불가

- `ROLES_ORDER` 배열에 MASTER 미포함 — MASTER 행은 별도 `<tr>` 로 하드코드.
- MASTER 셀: `●` 아이콘만 표시, `<input type="checkbox">` 없음 — 편집 불가.

### [PASS] TanStack Query staleTime 5분 캐시

- `usePermissions`: `staleTime: 5 * 60 * 1000` 적용.
- `useEffect` → `setPermissionsCache(query.data)` → module-level 동기 캐시 갱신.

### [PASS] mock.ts SP-D1 구현

- `GET /admin/permissions` / `PUT /admin/permissions` / `GET /admin/permissions/my` 3개 endpoint mock 구현.
- MASTER mock: 모든 페이지 view+edit 반환.
- 비마스터 mock: `_mockPermissionCells` 필터링 후 반환.

### [WARN-1] FE PageCode 타입과 BE PageCode enum 불일치 — 심각한 통합 갭

**FE `permissionsApi.ts` PageCode 타입 (12개)**:
```
DASHBOARD / WAREHOUSES / SALES / PURCHASES / TRANSFERS / ACCOUNTING
AROLOGIS / WAREHOUSE_OPS / ADMIN / DISPATCH_BOARD / PERMISSION_MATRIX / REPORTS
```

**BE `PageCode.java` enum (12개 code값)**:
```
accounting.tax-invoice.emit-nts / accounting.tax-invoice.list / accounting.deposit-match
accounting.daily-closing / accounting.general-ledger / notification.dispatch-sms.send-audit
purchases.receipt-ocr / purchases.slip.list / sales.slip.list / inbound.inspection
dispatch.board / admin.permissions
```

**두 체계가 완전히 다름**: FE는 대문자 상수 (DASHBOARD, WAREHOUSES 등), BE는 dot-separated 소문자 (accounting.tax-invoice.emit-nts 등). `GET /admin/permissions/my` 응답의 `pageCode` 필드가 FE 타입과 다른 형식으로 올 경우 `canAccess()` 항상 false 반환 → 모든 사용자가 권한 없음으로 처리될 위험.

**BE endpoint 실제 응답 형식 정의 없음**: `auth-service GET /auth/admin/permissions/check`는 auth-service에 존재하나 `GET /admin/permissions/my` (FE가 호출하는 user-service endpoint)는 BE 코드에서 미구현. FE가 존재하지 않는 endpoint를 호출함.

**Severity: FAIL (통합 미완성 — 사이드바 권한 필터 전체 미작동)**

### [FAIL-2] `/admin/permissions/my` 엔드포인트 BE 미구현

- FE `fetchMyPermissions()`: `GET /admin/permissions/my` 호출.
- BE (auth-service) `PermissionAdminController`: `GET /auth/admin/permissions` (매트릭스) + `GET /auth/admin/permissions/check` (단건 체크). `/my` endpoint 없음.
- FE가 의존하는 "현재 사용자 역할 기반 권한 목록" API가 auth-service에 존재하지 않아 운영 시 404 또는 api-gateway 라우팅 오류 발생.

**Severity: FAIL (BE-FE 인터페이스 미정합 — 수정 필수)**

### [WARN-3] canAccess 로딩 중 true 반환 — 보수적 허용 보안 고려

- `usePermissions.canAccess()`: 로딩 중 `true` 반환 (L62).
- `permissionsApi.canAccess()` 모듈 헬퍼: 캐시 없으면 `true` 반환 (L175).
- 초기 권한 로딩 지연 동안 미인가 사용자가 일시적으로 메뉴를 볼 수 있음. BE 가드가 최종 방어선이므로 데이터 보안상 허용 가능하나, 사용자 경험상 깜박임 발생 가능.
- **권고**: Skeleton UI 또는 로딩 스피너로 초기 렌더 지연 처리.

### [WARN-4] RbacRole 타입에 DEVELOPER 포함 — BE Role enum 확인 필요

- `permissionsApi.ts` `RbacRole` 타입에 `DEVELOPER` 포함.
- BE `DynamicPermissionService.getPermissionMatrix()`: `allRoles` 목록에 `DEVELOPER` 미포함 (MASTER/MANAGER/ACCOUNTANT/SALES/WAREHOUSE/DISPATCH/INVENTORY 7개).
- DEVELOPER 역할의 권한 매트릭스가 누락될 수 있음.

**Severity: WARN (통합 시 확인 필요)**

### [PASS] TypeScript 타입 안전성

- `PermissionCell`, `RbacRole`, `PageCode`, `PermissionAction` record 타입 정의 완전.
- `CellKey` 템플릿 리터럴 타입: `\`${RbacRole}__${PageCode}\`` — 타입 안전 키 구성.
- `EditState` = `Record<CellKey, PermissionCell>` — 인덱스 타입 명시.

---

## 결함 요약

| ID | 분류 | Severity | 설명 |
|---|---|---|---|
| FE-1 | 통합 불일치 | FAIL | FE PageCode 타입(대문자 상수)과 BE PageCode enum(dot-separated 소문자) 완전 불일치 |
| FE-2 | 미구현 | FAIL | `GET /admin/permissions/my` BE endpoint 미존재 — FE 호출 대상 API 없음 |
| FE-3 | 보안 UX | WARN | 로딩 중 canAccess=true 보수적 허용 — 깜박임 가능성 |
| FE-4 | 통합 확인 | WARN | DEVELOPER 역할이 FE에는 있고 BE getPermissionMatrix에는 없음 |

---

## 권장 Fix

1. **FE-1 + FE-2 (FAIL)**: BE-FE PageCode 체계 통일 결정 필요. 두 가지 옵션:
   - Option A: BE `PageCode` enum을 대문자 상수 체계로 변경 (FE 맞춤) + `/my` endpoint 추가.
   - Option B: FE `PageCode` 타입을 BE dot-separated 코드로 변경.
   - **권장 Option A**: FE PageCode 타입이 사이드바 메뉴 구조와 직접 매핑되므로 FE 체계 유지, BE를 맞추는 방향.
2. **FE-3 (WARN)**: 로딩 중 빈 사이드바(Skeleton) 표시 후 권한 로드 완료 시 메뉴 표시로 개선.
3. **FE-4 (WARN)**: BE `allRoles` 목록에 DEVELOPER 추가 여부 PM 확인 후 반영.
