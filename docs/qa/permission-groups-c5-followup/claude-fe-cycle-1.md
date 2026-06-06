# FE 리뷰어 — 권한그룹 C5 후속 정리 사이클 1 (Claude)

PR: #417 `fix/permission-groups-c5-followup-cleanup`
리뷰어: Claude FE agent
날짜: 2026-06-07

---

## 판정: 사이클 재진행 필요 (APPROVE 불가)

P1 결함 2건 (즉시 처리 의무). P0 없음. Nit 2건.

---

## 결함표

### P1-1 — full-menu-contract.spec.ts: blocked-partners / aligo-address-book 어서션 미갱신 (스펙 실패)

**위치**: `clients/desktop/playwright/full-menu-contract/full-menu-contract.spec.ts` L120-121

**내용**:

이 PR의 diff에서 `full-menu-contract.spec.ts`는 sheet-sync 한 줄(L117)만 갱신했다. 그런데 `routes/index.tsx`를 확인하면 `/admin/blocked-partners` 와 `/admin/aligo-address-book` 는 **이 PR 이전에 이미 PermissionGuard 로 전환**되어 있는 상태다(메인 브랜치에서 확인). 스펙 L120-121은 여전히 `RoleGuard allow={BLOCKED_PARTNER_ROLES}` / `RoleGuard allow={ALIGO_ADDRESS_BOOK_ROLES}` 를 검사하므로 이미 실패 상태다.

이 PR은 `sheet-sync` 한 줄만 고치고 두 어서션을 방치했다. 사이클 1 FE 리뷰 범위인 "Playwright 계약 갱신 적정성" 항목에 해당한다.

**권고**:
- L120: `expect(routes).toMatch(/path: '\/admin\/blocked-partners'[\s\S]*PermissionGuard pageCode="partners\.block" action="view"/)`
- L121: `expect(routes).toMatch(/path: '\/admin\/aligo-address-book'[\s\S]*PermissionGuard pageCode="aligo\.address-book" action="view"/)`

> 주석: `ARO_DISPATCH_RECONCILE_ROLES` 어서션(L128) 및 L102-106의 `SLIP_CREATE_ROLES` / `DELIVERY_BATCH_ROLES` 등도 메인 기준으로 이미 스펙 실패 상태이나, 이 PR이 도입한 실패가 아닌 **사전 잔존 결함**이다. 본 PR 범위에서는 처리 불필요 — 단, 개발책임자가 후속 정리 대상으로 등록 권고.

---

### P1-2 — AppLayout showDispatchSms: dynamicCanAccess 제거로 notification.dispatch-sms.send-audit 커스텀 grant 미반영

**위치**: `clients/desktop/src/renderer/components/AppLayout.tsx` L274

**내용**:

변경 전:
```
const showDispatchSms = dynamicCanAccess('notification.dispatch-sms.send-audit', 'view')
  || canAccessDispatchSms(auth?.role)
```

변경 후:
```
const showDispatchSms = hasAnyBuiltinRoleGroup(auth, ['MASTER', 'MANAGER', 'DISPATCH'])
```

계획서 S3에서 "BE 가 role-mode라 page-code가 없는 메뉴 → 그룹 기반 판정"으로 정의했으나, `notification.dispatch-sms.send-audit`는:

1. `SP_D1_PAGES` 에 등록되어 있다 (mock.ts L7010).
2. 라우트 `/arologis/dispatch-sms/send-audit`는 이미 `PermissionGuard pageCode="notification.dispatch-sms.send-audit"` 로 게이팅되어 있다 (routes/index.tsx L861).
3. 따라서 page-code 기반 동적 권한이 존재하는 메뉴다.

결과: 빌트인 MASTER/MANAGER/DISPATCH 그룹이 아닌 커스텀 그룹 사용자가 `notification.dispatch-sms.send-audit` 를 DB에서 동적으로 부여받아도 사이드바 항목이 노출되지 않는다. 라우트 PermissionGuard는 통과하지만 사이드바 진입점이 없는 상태(FE-hides-BE-allows).

**권고**: 기존과 동일하게 OR 조합 유지. 그룹 기반이 필요하다면 둘 다 유지:
```
const showDispatchSms = dynamicCanAccess('notification.dispatch-sms.send-audit', 'view')
  || hasAnyBuiltinRoleGroup(auth, ['MASTER', 'MANAGER', 'DISPATCH'])
```
> arologis category 내 다른 메뉴(수동 배차, 가배차 분류, 미배차 리스트 등)는 page-code 가 없으므로 그룹 기반 단독 사용이 적합하다. dispatch-sms.send-audit만 예외 처리 대상이다.

---

## Nit

### Nit-1 — sp-d2 T5 테스트 제목 "이중 가드 패턴" 잔류

**위치**: `clients/desktop/playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts`

`test('T5: 마스터가 SALES 에게 accounting.tax-invoice.batch-issue grant → 이중 가드 패턴 + 사이드바 확인', ...)` — 테스트 body는 "PermissionGuard 단일 게이트" 설명으로 갱신했으나 제목은 구 "이중 가드 패턴" 그대로다. 기능 영향 없음.

**권고**: 제목을 `→ PermissionGuard 단일 게이트 + 사이드바 확인` 으로 갱신.

---

### Nit-2 — SalesClosingPage.tsx 컴포넌트 Javadoc 권한 설명 미갱신

**위치**: `clients/desktop/src/renderer/routes/SalesClosingPage.tsx` (diff 미포함 파일)

Javadoc이 여전히 `BE @PreAuthorize 와 동일: 마감 실행: ACCOUNTANT / MASTER` 로 서술되어 있다. 현재 BE는 `@RequirePermission(page = "accounting.period-close")` 이다. 기능 영향 없음.

**권고**: Javadoc을 `@RequirePermission accounting.period-close` 기준으로 갱신.

---

## 항목별 검증 결과

### 1. page-code ↔ BE @RequirePermission 정합

| FE pageCode | BE 컨트롤러 | 결과 |
|---|---|---|
| `accounting.period-close` (/sales/closing) | `MonthEndCloseController` PAGE_CODE = "accounting.period-close" | 정합 ✓ |
| `sales.vendor-order` (/sales/vendor-order-upload) | 계획서 S5: BE endpoint 에 `@RequirePermission` 부여 포함 | 이 PR에서 BE 에도 적용 확인 불필요(scope 밖) — FE 전환 자체는 정합 ✓ |
| `products.sync` (/admin/sheet-sync) | `ProductAdminController` POST=CREATE, GET=VIEW `@RequirePermission` 추가 확인 ✓ | 정합 ✓ |
| `slip.edit-requests.decide` (sidebar) | V36 seed: MASTER/MANAGER 에만 부여 | 정합 ✓ (WAREHOUSE 제외는 의도된 narrowing — seed 기반 정교화) |
| `slip.cleanup` (sidebar) | BE slip.cleanup RequirePermission | 기존 전환 완료(C2b) ✓ |
| `accounting.edit-requests.decide` (sidebar) | 동적 OR 유지 | 정합 ✓ |

### 2. hasAnyBuiltinRoleGroup 전환 정확성 (arologis 6개 메뉴)

| 메뉴 | 구 role 배열 | 새 그룹 집합 | 동작 동일성 |
|---|---|---|---|
| showArologisManual | MASTER, MANAGER | MASTER, MANAGER | 동일 ✓ |
| showArologisPreClassify | MASTER, MANAGER, DISPATCH | MASTER, MANAGER, DISPATCH | 동일 ✓ |
| showArologisUnassigned | MASTER, MANAGER, DISPATCH | MASTER, MANAGER, DISPATCH | 동일 ✓ |
| showArologisAdmin | MASTER, MANAGER | MASTER, MANAGER | 동일 ✓ |
| showDispatchSms | DISPATCH, MANAGER, MASTER (role) OR dynamicCanAccess | MASTER, MANAGER, DISPATCH (group only) | **P1-2: dynamicCanAccess 제거됨** |
| showDispatchReconcile | DISPATCH, MANAGER, MASTER (role only) | MASTER, MANAGER, DISPATCH (group) | 동일 ✓ (role-only → group-only, 동치) |

UUID 화면 노출: BUILTIN_ROLE_GROUP_IDS는 내부 비교 전용(렌더 없음) — 규칙 준수 ✓

### 3. canQuerySales 시그니처 변경

- 변경 전: `canQuerySales(role: string | undefined | null)`
- 변경 후: `canQuerySales(auth: AuthSnapshot | null)` + `hasBuiltinRoleGroup(auth, 'SALES/MANAGER/MASTER')`
- `LoginResponse.role`은 빌트인 그룹 역매핑 파생값이므로 빌트인 그룹 UUID 매칭과 동치 ✓
- 커스텀 그룹만 가진 계정: 구 코드 `role === null` → false / 신 코드 그룹 없음 → false — 동일 ✓
- SalesQueryPage.tsx: `const role = auth?.role` 변수는 잔존하나 `canExportSlips(role)` 용도만 — 적합 ✓
- Playwright 계약: session.ts 시그니처 + 호출처 + hasBuiltinRoleGroup 3중 검증 — 충분 ✓

### 4. mock 카탈로그 products.sync

- `SP_D1_PAGES`에 `'products.sync'` 추가 ✓
- `MOCK_ACTION_ONLY_PAGES['products.sync'] = ['CREATE']` — edit=TRUE 시 CREATE만 도출 ✓
- MANAGER DEFAULT_VIEW + DEFAULT_EDIT에 `'products.sync'` 추가
- 도출 결과: `['VIEW', 'CREATE']` — V47 seed `can_view=TRUE, can_create=TRUE` 와 정합 ✓
- DOWNLOAD/PRINT 미과다부여(actionOnly 경로에서 else 분기 skip) ✓
- MASTER: allActions bypass — is_system_master 동작과 정합 ✓
- SALES/WAREHOUSE/ACCOUNTANT/INVENTORY: products.sync 미부여 — 과다 grant 없음 ✓

### 5. PermissionGuard 전환 3라우트 거부 UX 일관성

`PermissionGuard`는 권한 없음 시 `<Navigate to="/" replace />` (홈 redirect, 404 효과)로 구현되어 있으며 기존 전환 라우트와 동일 패턴이다 ✓. 로딩 중 Spinner 렌더로 flash 방지 ✓.

### 6. Playwright 계약 신규 spec (`permission-groups-c5-followup.spec.ts`) 품질

- canQuerySales 시그니처(session.ts) + 호출처(SalesQueryPage) + hasBuiltinRoleGroup 내부 검증 3개 커버 ✓
- AppLayout 정적 token 15개 부재 검증 ✓
- dynamicCanAccess 4개 호출처 명시적 검증 ✓
- S5 route 3건 regex 정합 ✓ (accounting-close-menu-gap spec 과 교차 검증 포함)
- P1-2 항목: `showDispatchSms`에 대한 dynamicCanAccess 삭제 검증 누락 (결함과 동일 원인)

### 7. 스펙 갱신 적정성

- `accounting-close-menu-gap.spec.ts`: sales/closing 어서션 정확히 갱신 ✓
- `sp-08-6-1-sales-slip-list-detail.spec.ts`: canQuerySales(role) → canQuerySales(auth) 갱신 ✓
- `sp-08-4-4-order-print-form.spec.ts`: IS_PARTNER_HEADER 반영(C5-4 downstream) ✓
- `sp-06-notion-db-crud.spec.ts`: GROUP_ / X-User-Groups 반영 ✓
- `sp-d2-accounting-permission-migration.spec.ts`: 이중 가드 주석 제거 ✓
- `full-menu-contract.spec.ts`: **P1-1 — blocked-partners/aligo-address-book 2개 어서션 미갱신**

---

## 즉시 처리 목록

| ID | 파일 | 처리 |
|---|---|---|
| P1-1 | `clients/desktop/playwright/full-menu-contract/full-menu-contract.spec.ts` L120-121 | blocked-partners/aligo-address-book PermissionGuard 어서션으로 교체 |
| P1-2 | `clients/desktop/src/renderer/components/AppLayout.tsx` L274 | showDispatchSms에 `dynamicCanAccess('notification.dispatch-sms.send-audit', 'view')` OR 조합 복원 |
| Nit-1 | `clients/desktop/playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts` | T5 제목 갱신 |
| Nit-2 | `clients/desktop/src/renderer/routes/SalesClosingPage.tsx` | Javadoc 권한 설명 갱신 |
