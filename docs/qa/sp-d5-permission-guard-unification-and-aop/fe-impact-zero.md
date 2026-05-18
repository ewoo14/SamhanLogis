# SP-D5 FE 영향 분석 보고서

작성일: 2026-05-19  
슬라이스: SP-D5 (BE PermissionGuard 단일화 인프라 + Counter.builder + AOP)  
분석자: FE agent  
결론: **FE 영향 0 — 코드 변경 불필요**

---

## (1) PermissionMatrixPage 회귀 확인

파일: `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`

- API path 고정: `GET /auth/admin/permissions` (전체 매트릭스), `POST /auth/admin/permissions/batch` (저장), `GET /auth/admin/permissions/my` (현재 사용자 권한).
  - 위 경로는 `permissionsApi.ts:5-8` 주석 및 실제 `apiClient.get/post` 호출에서 확인. SP-D5 BE 변경은 내부 AOP 레이어에만 영향을 미치며 외부 path 변경 없음.
- 7역할 x 41페이지 표: `ROLES_ORDER` 6개 + MASTER 고정행, `PAGE_GROUPS` 13그룹 287셀 구성이 소스코드에 정적 상수로 고정되어 있어 BE 변경에 무영향.
- row toggle (allow/deny) UX: `handleToggle` → `handleSave` → `updatePermissionBatch` 흐름. 배치 요청 형식(`{ permissions: [...] }`)은 SP-D5 변경 대상이 아님.

**영향: 0**

---

## (2) usePermissions hook 회귀

파일: `clients/desktop/src/renderer/hooks/usePermissions.ts`

- hook signature: `usePermissions(): UsePermissionsResult` (`canAccess / permissions / isLoading / isError`)는 SP-D5 이후에도 동일.
- 내부 동작: `fetchMyPermissions()` → `GET /auth/admin/permissions/my` → `PermissionDto(canView/canEdit)` → `MyPermission(actions[])` 변환. SP-D5 BE 변경은 응답 shape에 영향 없음 (`permissionsApi.ts:222-232` 확인).
- TanStack Query `staleTime: 5분`, `retry: 1` 설정 변경 없음.
- `setPermissionsCache` / 동기 `canAccess` 헬퍼 변경 없음.

**영향: 0**

---

## (3) Sidebar (AppLayout) 회귀

파일: `clients/desktop/src/renderer/components/AppLayout.tsx`

- SP-D1 hidden 정책: `SidebarLink` 컴포넌트가 `show=false` 시 `null` 반환 (DOM 미렌더). SP-D5 BE 변경과 무관한 FE 렌더링 로직.
- 동적 RBAC 변수: `dynamicCanAccess('accounting.*')`, `dynamicCanAccess('dispatch.board')` 등 `usePermissions` hook 결과를 사용. 후술 (2)항에서 hook signature 영향 0 확인 완료.
- 정적 role 체크 fallback (`canAccessAccounting`, `canInspectInbound` 등) 병행 구조 유지. SP-D5는 BE AOP 레이어 변경이므로 정적 함수에도 영향 없음.
- 메뉴 정의 (라우트 경로 / testid / 라벨) 변경 없음.

**영향: 0**

---

## (4) 25 endpoint 회귀 (403 처리 일관성)

파일: `clients/desktop/src/renderer/api/client.ts`

- `apiClient` axios 인터셉터는 401만 처리 (`err.response?.status === 401` → 토큰 클리어 + `#/login` 리다이렉트).
- 403 응답은 인터셉터에서 별도 처리 없이 `Promise.reject(err)` 로 각 호출 사이트로 전파됨. 이 동작은 SP-D5 이전에도 동일.
- BE가 `@RequirePermission` AOP로 403을 반환할 때 FE가 수신하는 HTTP status 및 에러 형식은 기존 `@PreAuthorize`와 동일 (`access denied` 403). 따라서 각 페이지의 에러 UI 표현 흐름에 변화 없음.
- `PermissionGuard.tsx`: 권한 없는 라우트 직접 진입 시 `canAccess()` 판정이 false이면 `<Navigate to="/" replace />`. 이 FE 라우트 가드는 `usePermissions` hook 기반이며 BE AOP 변경과 독립적으로 동작.

**영향: 0**

---

## (5) 신규 컴포넌트/스타일 작성 금지 확인

SP-D5는 BE 인프라 슬라이스 (shared/security 모듈 + AOP + Metrics)이므로 FE 코드 변경은 0이 정상.  
분석 중 FE 파일 수정은 전혀 발생하지 않았음. 신규 컴포넌트, 스타일, Storybook story 작성 없음.

**영향: 0 / 작업 없음 확인**

---

## 잠재 회귀 리스크 점검

| 리스크 항목 | 판정 | 근거 |
|---|---|---|
| `GET /auth/admin/permissions` path 변경 | 없음 | SP-D5는 내부 AOP만 변경 |
| 403 응답 body 형식 변경 | 없음 | BE ApiResponse envelope 동일 |
| 권한 캐시(5분) stale로 인한 일시 허용 | 기존과 동일 | `canAccess` 로딩 중 `true` 보수적 허용 정책 유지 |
| AOP 예외가 500으로 누출될 가능성 | BE 레벨 리스크 | FE는 이미 일반 에러 UI로 처리 |
| `PageCode` 타입 신규 추가 필요 여부 | 없음 | SP-D5는 기존 25개 endpoint AOP 대체이므로 신규 PageCode 없음 |

---

## 결론

SP-D5 BE 변경(DynamicPermissionClient interface 통합, @RequirePermission annotation, PermissionAspect AOP, PermissionGuardMetrics Counter)은 모두 BE 내부 인프라 변경이며, FE와의 API contract(HTTP status, 응답 shape, endpoint path)에 변경이 없다. FE 코드 변경은 0건이 정상이며, 이번 분석에서 회귀 리스크는 발견되지 않았다.
