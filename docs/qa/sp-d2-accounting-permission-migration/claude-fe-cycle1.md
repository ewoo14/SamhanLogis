# SP-D2 FE Review — Claude (Cycle 1)

브랜치: `feat/sp-d2-accounting-permission-migration` (commit `8090c109`)
리뷰 일시: 2026-05-18
리뷰어: Claude FE agent

---

## 1. 검증 범위

- `clients/desktop/src/renderer/api/permissionsApi.ts`
- `clients/desktop/src/renderer/routes/index.tsx`
- `clients/desktop/src/renderer/components/AppLayout.tsx`
- `clients/desktop/src/renderer/routes/PermissionMatrixPage.tsx`
- `clients/desktop/src/renderer/api/mock.ts`

---

## 2. 결함 목록

### [CRITICAL] C1 — Playwright spec ACCOUNTING_ROUTES pageCode 대규모 오매핑

**파일**: `playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts`  
**내용**: ACCOUNTING_ROUTES 상수에서 9개 라우트의 `pageCode` 가 `routes/index.tsx` 의 실제 PermissionGuard 매핑과 불일치한다.

| 라우트 | spec pageCode | routes/index.tsx 실제 pageCode |
|---|---|---|
| `/accounting/accounts` | `accounting.tax-invoice.list` | `accounting.accounts` |
| `/accounting/journals` | `accounting.tax-invoice.list` | `accounting.journals` |
| `/accounting/balances` | `accounting.tax-invoice.list` | `accounting.balances` |
| `/accounting/reports` | `accounting.tax-invoice.list` | `accounting.reports` |
| `/accounting/statement-batch` | `accounting.tax-invoice.list` | `accounting.statement-batch` |
| `/accounting/partner-ledger` | `accounting.tax-invoice.list` | `accounting.partner-ledger` |
| `/accounting/period-close` | `accounting.daily-closing` | `accounting.period-close` |

spec 의 pageCode 가 잘못되어 있으므로 T3 "accounting.tax-invoice.list revoke → 계정과목 hidden" 시나리오가 routes/index.tsx 의 `accounting.accounts` PermissionGuard 와 맞지 않는다. 즉, spec 이 `accounting.tax-invoice.list` 를 revoke 했을 때 `/accounting/accounts` 가 막힌다고 가정하지만, 실제 앱은 `accounting.accounts` 를 확인하므로 시나리오 전체가 잘못 된 전제를 검증한다.

**영향**: T3, T4, T5 시나리오 신뢰성 전면 붕괴.  
**권장 fix**: ACCOUNTING_ROUTES 의 pageCode 를 routes/index.tsx 실제 PermissionGuard pageCode 와 1:1 매핑으로 수정.

---

### [CRITICAL] C2 — `buildAccountantFullPermissions()` SP-D2 PageCode 7개 누락

**파일**: `playwright/...spec.ts`  
**내용**: T1 시뮬레이션에서 사용하는 ACCOUNTANT 권한 mock 에 SP-D2 신규 7개 PageCode (`accounting.accounts`, `accounting.journals`, `accounting.balances`, `accounting.reports`, `accounting.period-close`, `accounting.statement-batch`, `accounting.partner-ledger`)가 전혀 포함되지 않는다:
```ts
function buildAccountantFullPermissions() {
  return {
    success: true,
    data: [
      { pageCode: 'accounting.tax-invoice.emit-nts', ... },
      { pageCode: 'accounting.tax-invoice.list', ... },
      { pageCode: 'accounting.deposit-match', ... },
      { pageCode: 'accounting.daily-closing', ... },
      { pageCode: 'accounting.general-ledger', ... },
      // SP-D2 7개 누락!
    ],
  }
}
```
T1 에서 "12 페이지 모두 접근" 검증 시 실제로는 5개 PageCode 만 mock 되므로, `/accounting/accounts`, `/accounting/journals`, `/accounting/balances` 진입 시 PermissionGuard 가 false 를 반환하여 redirect "/" 발생. T1 실제 결과는 FAIL.

**권장 fix**: `buildAccountantFullPermissions()` 에 SP-D2 7개 PageCode 모두 추가.

---

### [HIGH] H1 — canAccessAccounting 정적 fallback OR 조합 설계 의도 모호

**파일**: `AppLayout.tsx`  
**내용**:
```tsx
const showAccounting =
  showAccountingAccounts || ... || showAccountingDepositMatch
  || canAccessAccounting(auth?.role)  // 정적 role 체크 OR
```
이 OR 결합은 "SP-D1 정책: 권한 없는 메뉴는 완전 미노출" 원칙에 위배될 수 있다. `dynamicCanAccess('accounting.accounts')` 가 false 이더라도 `canAccessAccounting(auth?.role)` 가 true 이면 `showAccounting` 은 true 가 된다. 즉 회계 카테고리 헤더가 표시되지만 하위 메뉴들은 모두 null 인 빈 카테고리가 표시될 수 있다.

동시에 이 설계가 "캐시 초기화 전 깜박임 방지" 의도라면 주석대로이지만, SALES 역할(`canAccessAccounting(SALES)` 가 false 임을 확인해야)에 대해서는 문제 없는지 별도 확인 필요.

**권장 fix**: `canAccessAccounting` fallback 을 초기 로딩 상태(`dynamicCanAccess` 가 캐시 없을 때 true 반환)에만 적용하도록 조건 정리.

---

### [HIGH] H2 — /accounting/statement-batch PermissionGuard pageCode 확인 필요

**파일**: `routes/index.tsx`  
**내용**: `/accounting/statement-batch` 라우트에 `pageCode="accounting.statement-batch"` PermissionGuard 적용 확인(line 816). `/print/statement-batch` 에도 동일 pageCode 적용 확인. PASS. 그러나 `/accounting/supplier-profiles` (hometax export / 사업자 양식 라우트) 라우트에는 `accounting.partner-ledger` 로 묶여 있는데(line 1063-1070), SupplierProfileController 가 `accounting.partner-ledger` PAGE_CODE 를 사용하는 것과 일치한다. PASS.

---

### [HIGH] H3 — PermissionMatrixPage `PAGES_ORDER` 19개이나 comment 는 "12 페이지"

**파일**: `PermissionMatrixPage.tsx`  
**내용**: 컴포넌트 헤더 주석에 `7 역할 × 12 페이지 코드 = 최대 84 셀`이라 되어 있으나, SP-D2 추가 후 실제 `PAGES_ORDER` 는 19개이다. 주석이 갱신되지 않았다.  
**권장 fix**: `7 역할 × 19 페이지 코드 = 최대 133 셀` 로 주석 수정.

---

### [HIGH] H4 — mock.ts ACCOUNTANT edit 허용 목록 SP-D2 V8 seed 불일치

**파일**: `api/mock.ts`  
**내용**: mock ACCOUNTANT view 목록에 SP-D2 7개 전부 포함. 그러나 edit 허용 목록은:
```ts
'accounting.accounts', 'accounting.journals', 'accounting.period-close', 'accounting.statement-batch'
```
4개만 포함. V8 seed 에서 ACCOUNTANT balances/reports/partner-ledger 는 `canEdit=FALSE` 이므로 seed 와 일치. 그러나 이 4개 목록이 `accounting.balances`, `accounting.reports`, `accounting.partner-ledger` 의 canEdit=false 정책을 반영한 것인지 명시적 주석이 없어 검토자가 의도를 파악하기 어렵다.  
**권장 fix**: 주석에 "V8 seed 기준: balances/reports/partner-ledger edit=false" 추가.

---

### [MEDIUM] M1 — T1 buildAccountantFullPermissions mock 에 SP-D2 신규 경로 data-testid 검증 없음

**파일**: `playwright/...spec.ts`  
**내용**: T1 에서는 `/accounting/accounts`, `/accounting/tax-invoices`, `/accounting/daily-closings` 세 경로만 진입 확인한다. SP-D2 신규 7개 경로(`/accounting/journals`, `/accounting/balances`, `/accounting/reports`, `/accounting/period-close`, `/accounting/statement-batch`, `/accounting/partner-ledger`) 에 대한 접근 확인 없음.  
**권장 fix**: ACCOUNTING_ROUTES 전체 순회 로직으로 T1 강화.

---

### [MEDIUM] M2 — T2 SALES 사이드바 가시성 단언이 try/catch 로 약화됨

**파일**: `playwright/...spec.ts`  
**내용**: 
```ts
const sidebarVisible = await sidebar.isVisible().catch(() => false)
if (sidebarVisible) { ... }
```
사이드바가 렌더링되지 않을 경우 inner assertion 전체가 skip 되어 PASS 처리된다. `sidebarVisible=false` 시 빈 단언 통과는 false green이다.  
**권장 fix**: `expect(sidebarVisible).toBe(true)` 로 사이드바 존재 자체를 먼저 단언.

---

### [MEDIUM] M3 — permissionsApi.ts `canAccess()` 캐시 미로딩 시 true 반환 설계 문서화 부재

**파일**: `api/permissionsApi.ts`  
**내용**: `canAccess()` 는 `_permissionsCache === null` 이면 `true` 반환(보수적 허용). SALES 사용자가 캐시가 없는 초기 로딩 순간에 회계 페이지에 접근 시도 시 brief window 동안 허용될 수 있다. 이 정책이 의도된 trade-off 라면 Javadoc/주석에 명시 필요.  
현재 주석: "로딩 중 — 보수적 허용"으로 있지만, 보안 위험에 대한 명시적 언급 없음.  
**권장 fix**: Javadoc 에 "보안 위험 trade-off: 서버 응답 완료 전 brief window 허용 가능" 명시.

---

### [LOW] L1 — PageCode 타입 19개 PASS

**내용**: `permissionsApi.ts` PageCode 타입에 SP-D1 12개 + SP-D2 7개 = 19개 정확히 선언. BE PageCode enum code 값과 완전 일치 확인. PASS.

---

### [LOW] L2 — PAGES_ORDER 19개 PASS

**내용**: `PermissionMatrixPage.tsx` PAGES_ORDER 배열 19개 PageCode 확인. PAGE_LABEL 19개 한국어 라벨 확인. PASS.

---

## 3. 항목별 검증 결과

| 검증 항목 | 결과 | 비고 |
|---|---|---|
| PermissionGuard 이중 가드 정합 (routes ↔ BE pageCode) | PASS | routes/index.tsx 12+ 라우트 모두 올바른 pageCode 확인 |
| 사이드바 hidden return null (회색 비활성 X) | PASS | SidebarLink show 프로퍼티 null 패턴 확인 |
| dynamicCanAccess 캐시 깜박임 처리 | WARN | canAccessAccounting OR fallback 의도 모호 |
| PermissionMatrixPage 19개 셀 렌더 | PASS | PAGES_ORDER 19개 확인 |
| dirty 셀 강조 | PASS | SP-D1 기존 dirty 마커 재활용 |
| mock 응답 BE 계약 정합 | PASS | SP_D1_PAGES 19개, view/edit matrix V8 seed 일치 |
| Playwright pageCode 매핑 정합 | FAIL | ACCOUNTING_ROUTES 7개 pageCode 오매핑 |
| T1 buildAccountantFullPermissions SP-D2 7개 | FAIL | 5개만 포함 |
| T2 SALES 사이드바 단언 강도 | FAIL | catch+if 로 약화된 false green 가능 |
| PermissionMatrixPage 주석 "12 → 19" | FAIL | 갱신 누락 |

---

## 4. TM 권고

**cycle 2 권고**.

CRITICAL 2건:
1. `ACCOUNTING_ROUTES` pageCode 7개 오매핑 — routes/index.tsx 실제 PermissionGuard 코드와 맞게 전면 수정 필수 (T3/T4/T5 시나리오 전제 붕괴)
2. `buildAccountantFullPermissions()` SP-D2 7개 PageCode 추가 (T1 false positive 방지)

HIGH 3건:
- H1: canAccessAccounting OR fallback 조건 정리
- H3: PermissionMatrixPage 주석 "12 → 19" 수정
- H4: mock.ts edit 목록 주석 보강

CRITICAL 건이 spec 의 핵심 시나리오(T3, T4, T5)를 모두 무효화하므로 cycle 2 수정 의무.
