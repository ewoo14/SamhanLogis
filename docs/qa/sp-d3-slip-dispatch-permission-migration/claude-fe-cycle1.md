# SP-D3 FE 리뷰 — Cycle 1
> 리뷰어: Claude FE Agent
> 브랜치: `feat/sp-d3-slip-dispatch-permission-migration` (commit `df337cdd`)
> 작성일: 2026-05-18

---

## 1. 리뷰 범위

| 파일 | 변경 유형 |
|------|-----------|
| `clients/desktop/src/renderer/routes/index.tsx` | 6 라우트 PermissionGuard 추가 |
| `clients/desktop/src/renderer/components/AppLayout.tsx` | showDispatchSms / showInboundInspection dynamicCanAccess 전환 |

---

## 2. PermissionGuard pageCode 매핑 정합 검증 (6 PageCode 1:1)

| 라우트 path | pageCode (routes/index.tsx) | PageCode (V7 seed) | 일치 |
|-------------|-----------------------------|--------------------|------|
| `/sales/slips` | `sales.slip.list` | `sales.slip.list` | 확인 |
| `/purchases/slips` | `purchases.slip.list` | `purchases.slip.list` | 확인 |
| `/purchases/receipt-ocr` | `purchases.receipt-ocr` | `purchases.receipt-ocr` | 확인 |
| `/dispatch-board` | `dispatch.board` | `dispatch.board` | 확인 |
| `/arologis/dispatch-sms/send-audit` | `notification.dispatch-sms.send-audit` | `notification.dispatch-sms.send-audit` | 확인 |
| `/warehouse/inbound-inspections` | `inbound.inspection` | `inbound.inspection` | 확인 |

6개 PageCode 모두 `V7__add_role_page_permissions.sql` seed와 1:1 정합 확인.

---

## 3. RoleGuard + PermissionGuard 이중 가드 구조 확인

### 3.1 이중 가드 적용 라우트

```tsx
// /dispatch-board — 이중 가드 정상 구조
{
  path: '/dispatch-board',
  element: (
    <RoleGuard allow={DISPATCH_BOARD_ROLES}>
      <PermissionGuard pageCode="dispatch.board" action="view">
        <DispatchBoardPage />
      </PermissionGuard>
    </RoleGuard>
  ),
}
```

`/dispatch-board`, `/arologis/dispatch-sms/send-audit`, `/warehouse/inbound-inspections` — 모두 `RoleGuard` 외부 + `PermissionGuard` 내부의 이중 가드 구조 확인.

### 3.2 단일 PermissionGuard 라우트

```tsx
// /sales/slips, /purchases/slips — RoleGuard 없이 PermissionGuard 단독
{
  path: '/sales/slips',
  element: (
    <PermissionGuard pageCode="sales.slip.list" action="view">
      <SlipListPage mode="OUTBOUND" />
    </PermissionGuard>
  ),
}
```

`/sales/slips`와 `/purchases/slips` 라우트는 `RoleGuard` 없이 `PermissionGuard` 단독 적용. BE 측 `@PreAuthorize`와의 연계를 FE 단독 `PermissionGuard`가 담당. SP-D2 회계 라우트가 `RoleGuard + PermissionGuard` 이중 구조를 채택한 것과 달리 단일 가드 패턴 채택.

이는 설계 의도가 "DB 동적 권한 단독 제어"로 전환된 것이라면 허용 가능하나, 미인증(비로그인) 사용자가 `/sales/slips` 직접 접근 시 `PermissionGuard`의 리다이렉트 로직에만 의존하게 됨. `PermissionGuard`가 미인증 상태를 올바르게 처리하는지 확인 필요.

### 3.3 /purchases/receipt-ocr 이중 가드 구조

```tsx
{
  path: '/purchases/receipt-ocr',
  element: (
    <RoleGuard allow={RECEIPT_OCR_ROLES}>
      <PermissionGuard pageCode="purchases.receipt-ocr" action="view">
        <ReceiptOcrPage />
      </PermissionGuard>
    </RoleGuard>
  ),
}
```

RoleGuard 외부 + PermissionGuard 내부의 정상 이중 가드 구조 확인.

---

## 4. AppLayout dynamicCanAccess 전환 검증

### 4.1 showDispatchSms 전환

```tsx
// [SP-D3] notification.dispatch-sms.send-audit 동적 RBAC 전환
const showDispatchSms = dynamicCanAccess('notification.dispatch-sms.send-audit', 'view')
```

이전 정적 `canAccessDispatchSms(auth?.role)` 체크에서 `dynamicCanAccess` 기반으로 전환됨. DB override가 사이드바 표시/숨김에 즉시 반영되는 구조.

### 4.2 showInboundInspection 전환

```tsx
// [SP-D3] inbound.inspection 동적 RBAC 전환
const showInboundInspection = dynamicCanAccess('inbound.inspection', 'view')
```

이전 `canInspectInbound(auth?.role)` 정적 체크에서 `dynamicCanAccess` 기반으로 전환됨.

### 4.3 showDispatchBoard 기존 전환 확인

```tsx
// 기존 [samhan-dispatch-board Phase A + SP-D1 cycle 2]
const showDispatchBoard = dynamicCanAccess('dispatch.board', 'view')
```

`dispatch.board` 사이드바는 SP-D1에서 이미 `dynamicCanAccess`로 전환되어 있어 SP-D3 추가 작업 불필요. 일관성 확인.

---

## 5. SALES/WAREHOUSE/DISPATCH hidden 요구 사항 검증

사용자 요구 ② "SALES 매입/배차 hidden, WAREHOUSE 매출/배차 hidden, DISPATCH 매입/매출 hidden"에 대한 FE 구현 평가.

| 역할 | 숨겨야 할 메뉴 | 구현 방식 | 상태 |
|------|---------------|----------|------|
| SALES | 매입 슬립(`/purchases/slips`) | PermissionGuard pageCode 없으면 redirect | 정상 |
| SALES | 배차(`/dispatch-board`) | PermissionGuard + sidebarLink show=false | V7 SALES dispatch.board canView=TRUE 문제 (F-FE-01 참조) |
| WAREHOUSE | 매출 슬립(`/sales/slips`) | PermissionGuard pageCode 없으면 redirect | 정상 |
| DISPATCH | 매입 슬립(`/purchases/slips`) | PermissionGuard pageCode 없으면 redirect | 정상 |
| DISPATCH | 매출 슬립(`/sales/slips`) | PermissionGuard pageCode 없으면 redirect | 정상 |

---

## 6. data-testid 기반 assertion 확인

Playwright 스펙에서 참조하는 `data-testid` 속성이 AppLayout에 실제로 존재하는지 확인:

| Playwright `sidebarTestId` | AppLayout 존재 여부 |
|---------------------------|---------------------|
| `sidebar-dispatch-board` | `data-testid="sidebar-dispatch-board"` 확인 |
| `sidebar-arologis-dispatch-sms` | `data-testid="sidebar-arologis-dispatch-sms"` 확인 |
| `sidebar-warehouse-inbound-inspections` | `data-testid="sidebar-warehouse-inbound-inspections"` 확인 |
| `sidebar-sales` | 확인 필요 (아래 F-FE-02 참조) |
| `sidebar-purchases` | 확인 필요 (아래 F-FE-02 참조) |
| `sidebar-purchases-receipt-ocr` | 확인 필요 (아래 F-FE-02 참조) |
| `sidebar-arologis-sms-send-audit` | 확인 필요 (아래 F-FE-02 참조) |

---

## 7. HashRouter URL 정합

Playwright 스펙의 URL 상수가 `createHashRouter` 기반:

```ts
const SALES_SLIPS_URL = `${BASE_URL}/#/sales/slips?mockRole=SALES`
const DISPATCH_BOARD_DISPATCH_URL = `${BASE_URL}/#/dispatch-board?mockRole=DISPATCH`
```

routes/index.tsx의 `createHashRouter` 사용과 일치. `/#/` prefix 정합 확인.

---

## 8. 발견된 결함

### F-FE-01 [CRITICAL] V7 SALES dispatch.board canView=TRUE — 사이드바 배차 메뉴 hidden 불가

**위치**: AppLayout.tsx 306라인, V7 seed 118번 라인

```tsx
const showDispatchBoard = dynamicCanAccess('dispatch.board', 'view')
```

`dynamicCanAccess`가 `usePermissions` hook을 통해 `GET /auth/admin/permissions/my` 응답을 기반으로 동작하는데, V7 seed에서 `SALES` 역할의 `dispatch.board` canView=TRUE로 설정됨.

결과: SALES 로그인 시 `showDispatchBoard=true`가 되어 사이드바에 배차 메뉴가 표시됨. Playwright T1 시나리오("SALES → 배차 hidden")와 직접 충돌. BE F-BE-02와 동일 근원 결함.

**권고**: V7 후속 migration(V8 또는 신규 V9)에서 SALES `dispatch.board` canView=FALSE, canEdit=FALSE UPDATE 추가. 또는 AppLayout에서 `showDispatchBoard` 계산 시 정적 역할 체크 병행 유지.

### F-FE-02 [MAJOR] Playwright spec sidebarTestId 불일치 — sidebar-purchases-receipt-ocr, sidebar-arologis-sms-send-audit 미확인

**위치**: `sp-d3-slip-dispatch-permission-migration.spec.ts` `SP_D3_ROUTES` 배열

```ts
{ sidebarTestId: 'sidebar-purchases-receipt-ocr', ... }
{ sidebarTestId: 'sidebar-arologis-sms-send-audit', ... }
```

AppLayout grep 결과 `sidebar-arologis-dispatch-sms` (`data-testid`는 존재), `sidebar-arologis-sms-send-audit` (`data-testid` 별도 확인 불가). Playwright 스펙이 사이드바 링크 클릭보다 URL 직접 이동 방식을 주로 사용하므로 실제 테스트 실행에서 assertion 실패 가능성.

**권고**: AppLayout의 `/arologis/dispatch-sms/send-audit` 링크와 `/purchases/receipt-ocr` 링크에 `data-testid` 일치 확인 후 필요시 추가.

### F-FE-03 [MINOR] /sales/slips, /purchases/slips — RoleGuard 없이 PermissionGuard 단독 (미인증 처리 의존)

**위치**: `routes/index.tsx` 374~379, 495~500 라인

두 라우트가 `RoleGuard` 없이 `PermissionGuard` 단독으로 구성됨. `PermissionGuard` 컴포넌트가 `usePermissions` 훅의 응답이 비어있거나 로딩 중일 때 fallback 처리를 어떻게 하는지에 따라 미인증 사용자가 순간적으로 페이지에 접근할 수 있는 race condition 가능성.

SP-D2 회계 라우트는 `RoleGuard allow={ACCOUNTING_ROLES}` 외부 가드를 유지하면서 `PermissionGuard`를 내부 추가 가드로 사용하는 패턴. SP-D3 슬립 라우트는 이 패턴을 따르지 않음.

**권고**: `/sales/slips`에 `<RoleGuard allow={SLIP_ROLES}>` 외부 가드 추가 또는 `PermissionGuard`의 미인증 처리 로직 확인 및 문서화.

### F-FE-04 [INFO] showReceiptOcr AppLayout — purchases.receipt-ocr 사이드바 연동 주석 미비

**위치**: `AppLayout.tsx` 289~290 라인

```tsx
const showReceiptOcr = dynamicCanAccess('purchases.receipt-ocr', 'view')
```

동적 RBAC 전환은 확인. 그러나 SP-D3 마이그레이션 주석이 없어 이 전환이 SP-D3의 일부인지 이전 슬라이스에서 이미 수행된 것인지 불명확.

**권고**: `// [SP-D3] purchases.receipt-ocr 동적 RBAC 전환` 주석 추가.

---

## 9. 총평

| 항목 | 상태 |
|------|------|
| PermissionGuard pageCode 1:1 정합 | 완전 달성 |
| RoleGuard + PermissionGuard 이중 가드 | 부분 달성 (슬립 2개 라우트 단일 가드) |
| dynamicCanAccess 전환 | 완전 달성 |
| HashRouter URL 정합 | 완전 달성 |
| 사용자 요구 ② hidden 보장 | SALES dispatch.board 문제로 부분 미달 |

**사이클 1 결론**: F-FE-01(CRITICAL — V7 SALES dispatch.board canView=TRUE), F-FE-02(MAJOR — testid 불일치) 해결 후 재리뷰 필요.

---

## 10. TM 결정 권고

**cycle 2 수정 필수** — F-FE-01 (SALES 배차 메뉴 hidden 미달)은 사용자 요구 ② 직접 위반. cycle 2에서 V7 후속 seed fix migration 또는 AppLayout 정적 역할 체크 보완 필요.
