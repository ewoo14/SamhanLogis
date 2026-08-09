# PR #1145 R16 회귀 울타리 보고

작업 브랜치: `feat/1144-accounting-slip-spec`  
작업 HEAD: `d041fe23048aa1b109e0654c9ec7f44790b30e2e`  
범위: RED-B 목록 화면 쓰기 버튼 양방향 계약, RED-C form route `action="create"` 계약

## RED-B — 매출·매입 목록 쓰기버튼 양방향 계약

신규 테스트:

- `clients/desktop/src/renderer/routes/accounting/SalesPurchaseAccountingSlipPermissionContract.test.tsx`
- `작성`은 `create`, DRAFT `전기`는 `update` 권한을 사용한다.
- 매출·매입 각각 권한 거부 시 두 버튼 모두 미렌더링, 권한 허용 시 두 버튼 모두 렌더링을 실제 jsdom 컴포넌트로 확인한다.
- `usePermissions` mock은 이 테스트 파일 내부에만 존재한다.

### 뮤테이션 RED 원문 A — 게이트 조건 제거

임시 변이:

```diff
- canPost && row.status === 'DRAFT' ? (
+ row.status === 'DRAFT' ? (
- {canCreate ? (
+ {true ? (
```

매출·매입 페이지 양쪽에 적용 후 실행:

```text
npx vitest run src/renderer/routes/accounting/SalesPurchaseAccountingSlipPermissionContract.test.tsx --reporter=verbose
```

원문 요약:

```text
FAIL ... sales ... does not render 작성 or DRAFT 전기 when create/update are denied
  expected <button ...> to be null
FAIL ... purchase ... does not render 작성 or DRAFT 전기 when create/update are denied
  expected <button ...> to be null
Tests 2 failed | 2 passed (4)
EXIT_CODE=1
```

실제 수신 원문:

```text
Received:
<button type="button" variant="primary">
  작성
</button>
```

즉시 원복했다.

### 뮤테이션 RED 원문 B — 권한 mock 반전

임시 변이:

```diff
- action === 'view'
+ action !== 'view'
```

동일 명령 실행 원문:

```text
FAIL ... sales ... does not render 작성 or DRAFT 전기 when create/update are denied
FAIL ... purchase ... does not render 작성 or DRAFT 전기 when create/update are denied
Tests 2 failed | 2 passed (4)
EXIT_CODE=1
```

실패 assertion 원문:

```text
AssertionError: expected <button type="button" …(1)></button> to be null
Received: <button type="button" variant="primary">작성</button>
```

즉시 원복했다.

### RED-B GREEN 원문

```text
npx vitest run src/renderer/routes/accounting/SalesPurchaseAccountingSlipPermissionContract.test.tsx src/renderer/test-utils/accounting-slip-route-permission-contract.test.ts --reporter=verbose
Test Files 2 passed (2)
Tests 5 passed (5)
EXIT_CODE=0
```

## RED-C — form route `action="create"` 계약

신규 테스트: `clients/desktop/src/renderer/test-utils/accounting-slip-route-permission-contract.test.ts`

`/accounting/sales-slips/new`가 매출 form을, `/accounting/purchase-slips/new`가 매입 form을 각각 `PermissionGuard pageCode=... action="create"` 내부에 두는지 경로 블록 단위로 단정한다.

### 뮤테이션 RED 원문 — `action="view"` 하향

임시 변이:

```diff
- <PermissionGuard pageCode="accounting.sales-slip.accounting" action="create">
+ <PermissionGuard pageCode="accounting.sales-slip.accounting" action="view">
- <PermissionGuard pageCode="accounting.purchase-slip.accounting" action="create">
+ <PermissionGuard pageCode="accounting.purchase-slip.accounting" action="view">
```

실행:

```text
npx vitest run src/renderer/test-utils/accounting-slip-route-permission-contract.test.ts --reporter=verbose
```

원문:

```text
FAIL ... keeps both form routes behind create PermissionGuard actions
Expected: /PermissionGuard ... action="create" ... SalesAccountingSlipFormPage/
Received: action="view" ... <SalesAccountingSlipFormPage />
Tests 1 failed (1)
EXIT_CODE=1
```

즉시 원복했다. 최종 원문:

```text
npx vitest run src/renderer/test-utils/accounting-slip-route-permission-contract.test.ts --reporter=verbose
Test Files 1 passed (1)
Tests 1 passed (1)
EXIT_CODE=0
```

## 반대급부 D·E·F 확인 원문

공통 실행 환경:

```text
VITE_API_BASE_URL=http://127.0.0.1:1
```

명령:

```text
npx vitest run src/renderer/routes/accounting/SalesPurchaseAccountingSlipPermissionContract.test.tsx src/renderer/test-utils/accounting-slip-route-permission-contract.test.ts src/renderer/routes/accounting/SalesPurchaseAccountingSlipAllocationContract.test.tsx src/renderer/test-utils/accounting-slip-permission-contract.test.ts --reporter=dot
```

원문:

```text
Test Files 4 passed (4)
Tests 31 passed (31)
DESKTOP_RELEVANT_VITEST_EXIT=0
```

- D: allocation contract `16 tests` 통과.
- E: `accounting-slip-permission-contract.test.ts` `10 tests` 통과.
- F: `127.0.0.1:1` 네트워크 격리에서 AggregateError 없이 종료 코드 0.

freshness IT:

```text
& .\gradlew.bat --no-daemon :services:auth-service:test --tests '*AccountingPermissionProjectionFreshnessIT' --rerun-tasks --console=plain
BUILD SUCCESSFUL in 33s
FRESHNESS_IT_EXIT=0
```

변경 금지 대상 `permission-mock-divergences.ts`, `accounting-slip-permission-db-snapshot.ts`, V99 SQL은 건드리지 않았다.

## CI 순서 확인

```text
cd clients/web/design-system
npm run build
DESIGN_SYSTEM_BUILD_EXIT=0
```

```text
cd clients/desktop
npm run typecheck
DESKTOP_TYPECHECK_EXIT=1
```

`npm run typecheck`는 코드 오류가 아니라 기존 미추적 R15 real-QA 스펙 때문에 공식 real-QA 집합 게이트에서 중단됐다.

```text
clients/desktop/playwright/1145-r14-real-qa/accounting-slip-actions-real-qa.spec.ts
```

해당 상태에서 내부 TypeScript 단계는 별도 확인했다.

```text
npx tsc -p tsconfig.node.json --noEmit  -> TSC_NODE_EXIT=0
npx tsc -p tsconfig.web.json --noEmit   -> TSC_WEB_EXIT=0
```

낡은 전체 Vitest의 `build-output-cjs-interop.test.ts`는 요청대로 실행하지 않았다.

## 신규 생성 파일

- `clients/desktop/src/renderer/routes/accounting/SalesPurchaseAccountingSlipPermissionContract.test.tsx`
- `clients/desktop/src/renderer/test-utils/accounting-slip-route-permission-contract.test.ts`
- `docs/dev-reports/2026-08-09-1145-r16-regression-fences.md`

기존 미추적 `clients/desktop/playwright/1145-r14-real-qa/` 디렉터리는 건드리지 않았다.

## 못 한 것 / 제한

- `npm run typecheck` 공식 명령은 기존 미추적 real-QA 스펙 집합 불일치로 종료 코드 1이었다. 해당 스펙을 추가·삭제·추적 처리하지 않았다.
- 전체 Vitest 및 Electron interop 실패 원인 수정은 하지 않았다.
- commit, push, V99 SQL 변경, 공유 DB write는 하지 않았다.
