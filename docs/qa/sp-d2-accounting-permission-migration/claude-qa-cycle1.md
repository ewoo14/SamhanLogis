# SP-D2 QA Review — Claude (Cycle 1)

브랜치: `feat/sp-d2-accounting-permission-migration` (commit `8090c109`)
리뷰 일시: 2026-05-18
리뷰어: Claude QA agent

---

## 1. 검증 범위

- `playwright/sp-d2-accounting-permission-migration/sp-d2-accounting-permission-migration.spec.ts` (T1~T5)
- `services/accounting-service/.../it/AccountingDynamicPermissionIT.java` (C1~C8)
- `docs/qa/sp-d2-accounting-permission-migration/domain-integrity-check.md`
- `docs/qa/sp-d2-accounting-permission-migration/scenarios/sp-d2-scenarios.md`
- `docs/dev-reports/sp-d2-accounting-permission-migration.md`

---

## 2. 결함 목록

### [CRITICAL] C1 — Playwright T1~T3 false green — ACCOUNTING_ROUTES pageCode 오매핑

**파일**: `playwright/...spec.ts`, ACCOUNTING_ROUTES 상수  
**내용**: `ACCOUNTING_ROUTES` 의 9개 라우트가 routes/index.tsx 의 실제 PermissionGuard pageCode 와 불일치한다 (FE 리뷰 C1과 동일). 이는 QA 관점에서 심각한 false green 리스크이다.

특히:
- `/accounting/accounts` → spec `accounting.tax-invoice.list` (실제 `accounting.accounts`)
- `/accounting/journals` → spec `accounting.tax-invoice.list` (실제 `accounting.journals`)
- `/accounting/reports` → spec `accounting.tax-invoice.list` (실제 `accounting.reports`)
- `/accounting/period-close` → spec `accounting.daily-closing` (실제 `accounting.period-close`)

T3 시나리오: "accounting.tax-invoice.list revoke → 계정과목 hidden" — 실제 앱은 `accounting.accounts` 를 확인하므로, spec mock 이 `accounting.tax-invoice.list` 만 revoke 해도 `/accounting/accounts` PermissionGuard 는 `accounting.accounts` view=true(캐시 또는 기본값)로 통과하여 redirect 가 발생하지 않을 수 있다. 즉 T3 는 "통과" 처럼 보이지만 실제 버그(잘못된 pageCode) 를 감지하지 못한다.

**영향**: T1 의 SP-D2 7개 페이지 접근 확인 누락(buildAccountantFullPermissions 5개만 포함 + ACCOUNTING_ROUTES pageCode 오매핑 이중 결함).  
**권장 fix**: ACCOUNTING_ROUTES pageCode 전면 교체 + buildAccountantFullPermissions SP-D2 7개 추가.

---

### [CRITICAL] C2 — IT C2 false green — `200 || 403` 이중 허용

**파일**: `AccountingDynamicPermissionIT.java`, C2 케이스  
**내용**: SP-09 패턴 의무 "false green 0건"을 위반한다:
```java
boolean isExpected = status == 200 || status == 403;
```
canView=false stub 임에도 200 을 허용하는 것은 VIEW 차단 구현이 미완료임을 숨기는 false green이다. IT 의 존재 목적이 "동적 권한 deny 시나리오 검증"이므로 이 허용은 핵심 목적 위반이다.  
**권장 fix**: `status().isForbidden()` 단일 assert.

---

### [CRITICAL] C3 — Playwright T2 사이드바 assertion `if (sidebarVisible)` 분기 false green

**파일**: `playwright/...spec.ts`, T2  
**내용**: 
```ts
const sidebarVisible = await sidebar.isVisible().catch(() => false)
if (sidebarVisible) {
  // 회계 카테고리 링크 미표시 확인
}
```
`sidebarVisible=false` 이면 inner assertion 이 실행되지 않아 PASS 처리. 사이드바가 렌더링되지 않은 경우에도 테스트가 통과되어 false green. SP-09 패턴("false green 0건") 위반.  
**권장 fix**: `expect(sidebarVisible, '사이드바가 렌더링되어야 함').toBe(true)` 를 분기 앞에 추가.

---

### [HIGH] H1 — IT C8 `404` 불필요 허용

**파일**: `AccountingDynamicPermissionIT.java`, C8  
**내용**:
```java
boolean isExpected = status == 201 || status == 409 || status == 404;
```
"일마감 POST fallback 통과" 시나리오에서 404 는 발생 경로가 없다(partnerCode 없는 요청에서 NOT_FOUND 발생 불가). 404 허용은 실제 결함(예: 잘못된 URL 매핑으로 404 반환)을 통과시킬 수 있다.  
**권장 fix**: `status == 201 || status == 409` 로 좁힘.

---

### [HIGH] H2 — T1 검증 범위 부족 — SP-D2 신규 7개 라우트 미포함

**파일**: `playwright/...spec.ts`, T1  
**내용**: T1 에서 검증하는 라우트:
- `/accounting/accounts` (계정과목)
- `/accounting/tax-invoices` (세금계산서)
- `/accounting/daily-closings` (일마감)

SP-D2 신규 7개 라우트(`/accounting/journals`, `/accounting/balances`, `/accounting/reports`, `/accounting/period-close`, `/accounting/statement-batch`, `/accounting/partner-ledger`) 접근 확인 없음. "12 페이지 모두 접근" 제목과 다르게 3개만 검증.  
**권장 fix**: ACCOUNTING_ROUTES 배열 전체 순회하여 각 라우트 접근 확인.

---

### [HIGH] H3 — T4 직접 URL 차단 확인 범위 불충분

**파일**: `playwright/...spec.ts`, T4  
**내용**: T4 는 `accounting.tax-invoice.list` revoke 상태에서 `/accounting/tax-invoices/batch` 와 `/accounting/accounts` 두 URL만 직접 진입 차단을 검증한다. SP-D2 신규 7개 경로 중 `accounting.accounts` 외 나머지 6개는 T4 에서 검증되지 않는다.  
**권장 fix**: T4 에서 `accounting.accounts`, `accounting.journals`, `accounting.balances` 등 추가 URL 직접 진입 차단 검증.

---

### [HIGH] H4 — domain-integrity-check.md SQL 쿼리 검증 불가

**파일**: `docs/qa/sp-d2-accounting-permission-migration/domain-integrity-check.md`  
**내용**: 도메인 정합성 체크 SQL 이 존재하나, 이 SQL 이 실제 실행된 결과(output)가 문서에 없다. "검증됨" 표기 없이 쿼리만 나열된 경우 실제 검증이 이루어졌는지 확인 불가.  
**권장 fix**: 각 쿼리의 실행 결과(row count, 예시 값) 또는 "통과" 마커 추가.

---

### [MEDIUM] M1 — T5 SALES grant 후 사이드바 확인 시뮬레이션 방식 취약

**파일**: `playwright/...spec.ts`, T5  
**내용**: T5 는 SALES 에게 `accounting.tax-invoice.list` grant 후 사이드바에 회계 카테고리 + 1 메뉴 표시를 검증한다. 그러나 routes/index.tsx 에서 `/accounting/tax-invoices` 는 `accounting.tax-invoice.emit-nts` pageCode 를 사용하고, `/accounting/tax-invoices/batch` 는 `accounting.tax-invoice.list` 를 사용한다. 즉 `accounting.tax-invoice.list` grant 만으로 세금계산서 목록 라우트가 나타날지 여부는 라우트 구성에 따라 다르다. spec 이 `accounting.tax-invoice.list` grant → 세금계산서 링크 표시라고 가정하나 실제 AppLayout 에서 `showAccountingTaxInvoice = dynamicCanAccess('accounting.tax-invoice.emit-nts') || dynamicCanAccess('accounting.tax-invoice.list')` 이므로 grant 로 표시됨. T5 시나리오는 이 OR 조건을 암묵적으로 의존한다.  
**권장 fix**: T5 주석에 OR 조건 명시.

---

### [MEDIUM] M2 — IT C7 200/422 이중 허용

**파일**: `AccountingDynamicPermissionIT.java`, C7  
**내용**:
```java
boolean isExpected = status == 200 || status == 422;
```
canView=true, canEdit=true stub 에서 200 이 정상이다. 422 는 accountFinNo validation 오류이나, 요청 본문에 `accountFinNo: "TEST-FIN-001"` 을 명시하였으므로 422 는 발생하지 않아야 한다. 422 허용은 불필요한 느슨함.  
**권장 fix**: `status().isOk()` 단일 assert.

---

### [LOW] L1 — scenarios/sp-d2-scenarios.md 완성도 PASS

**내용**: 8 BE IT 시나리오 + 5 Playwright 시나리오 기술. 각 시나리오 전제/기대값 명확. PASS.

---

### [LOW] L2 — dev-report sp-d2-accounting-permission-migration.md 완성도

**내용**: dev-report 에 BE 구현 결과 섹션 4/6 갱신 반영. FE/QA 섹션 공백 여부 확인 필요.

---

### [LOW] L3 — Playwright SKIP_UI 플래그 false green 방지 PASS

**내용**: `test.skip(SKIP_UI, ...)` 사용 + `beforeEach` dev server 가용 여부 `expect(ok).toBe(true)` — SP-09 패턴 준수. PASS.

---

## 3. 항목별 검증 결과

| 검증 항목 | 결과 | 비고 |
|---|---|---|
| false green 가드 0건 | FAIL | C2(IT)/C3(Playwright) false green |
| data-testid 15+ | PASS | 사이드바 7개 신규 + 기존 매트릭스 다수 |
| URL HashRouter 정합 `/#/accounting/*` | PASS | URL 상수 모두 `/#/` prefix 확인 |
| T1 12 라우트 ACCOUNTANT 접근 | FAIL | 3개만 검증, pageCode 오매핑, 권한 mock 5개만 포함 |
| T2 SALES hidden + redirect | FAIL | sidebarVisible if 분기 false green |
| T3 권한 revoke partial | FAIL | pageCode 오매핑으로 시나리오 무효 |
| T4 직접 URL 차단 | WARN | 범위 부족 (2개 URL만 검증) |
| T5 grant + 사이드바 표시 | WARN | OR 조건 암묵적 의존 |
| IT 8 case 이중 가드 검증 | FAIL | C2(false green), C7(느슨한 assert) |
| IT C4 canEdit=false + canView=true → 403 | PASS | 단일 isForbidden assert |
| IT C8 fallback 통과 | WARN | 404 불필요 허용 |

---

## 4. TM 권고

**cycle 2 권고 (필수)**.

CRITICAL 3건:
1. ACCOUNTING_ROUTES pageCode 오매핑 전면 수정 (T1~T5 시나리오 전제 붕괴)
2. IT C2 `200 || 403` → `isForbidden()` 단일 assert
3. T2 사이드바 assertion `if (sidebarVisible)` → `expect(sidebarVisible).toBe(true)` + 분기 제거

HIGH 4건:
- H1: IT C8 `404` 허용 제거
- H2: T1 12개 라우트 전체 접근 검증
- H3: T4 직접 URL 차단 범위 확대
- H4: domain-integrity-check.md 실행 결과 추가

SP-09 패턴 의무("false green 0건") 기준으로 현재 CRITICAL 3건으로 cycle 2 없이 PR 승인 불가.
