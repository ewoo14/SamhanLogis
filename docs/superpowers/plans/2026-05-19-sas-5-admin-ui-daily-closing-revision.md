# SP-SAS-5 Admin UI + 일마감 개정 + 회계 메뉴 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development

**Goal:** Electron desktop 클라이언트에 매출전표/매입전표/세금계산서 발행 묶음/세금계산서 수신 4 페이지 신설 + 기존 `DailyClosingPage` 일마감 개정 (하루 단위 검색 + 매출/매입/통합 토글 + sourceKind 분기) + 기존 GAS 회계 메뉴 13건 + 신규 SAS 4건 사이드바 통합.

**Architecture:** React + Vite + Tailwind + design-system 패키지. 기존 `DailyClosingPage` 점진 개정 (legacy 호환 default). 회계 사이드바 트리 갱신. 신규 페이지는 mock data (VITE_MOCK_MODE=1) + 실 API 양쪽 지원.

**Tech Stack:** TypeScript / React / Vite / Tailwind / Electron / Playwright

**Spec ref:** §6 Admin UI + 17건 회계 메뉴 통합, §7-G 일마감 기존 코드 개정

**Dependency:** SP-SAS-1 ~ SP-SAS-4 머지 완료 (BE endpoint 4종 + 일마감 BE 개정)

---

## File Structure

**Create (FE):**
- `clients/desktop/src/renderer/routes/SalesAccountingSlipPage.tsx` (목록 + 작성 dialog)
- `clients/desktop/src/renderer/routes/SalesAccountingSlipFormPage.tsx` (별도 작성 페이지, 출고전표 선택 + line 분할)
- `clients/desktop/src/renderer/routes/PurchaseAccountingSlipPage.tsx`
- `clients/desktop/src/renderer/routes/PurchaseAccountingSlipFormPage.tsx`
- `clients/desktop/src/renderer/routes/TaxInvoiceBatchIssuePage.tsx` (매출전표 N장 선택 → TaxInvoice 1장)
- `clients/desktop/src/renderer/routes/TaxInvoiceInboundPage.tsx` (수신 등록 + 매입전표 매칭)
- `clients/desktop/src/renderer/api/salesAccountingSlipApi.ts`
- `clients/desktop/src/renderer/api/purchaseAccountingSlipApi.ts`
- `clients/desktop/src/renderer/api/taxInvoiceBatchApi.ts` (extend 기존)
- `clients/desktop/src/renderer/components/SalesSlipLineAllocationEditor.tsx` (재사용 가능 UI — Sales/Purchase 양쪽)
- `clients/desktop/playwright/sp-sas/sp-sas.spec.ts`
- `docs/qa/sp-sas/scenarios.md` + `screenshots/`

**Create (BE 일마감 개정):**
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/DailyClosingKind.java` (enum SALES/PURCHASE)
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/DailyClosingSourceKind.java` (enum TAX_INVOICE/SALES_SLIP/PURCHASE_SLIP)
- `services/accounting-service/src/main/resources/db/migration/V21__alter_daily_closings_add_kinds.sql`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/DailyClosingServiceSourceKindTest.java`

**Modify (BE):**
- `domain/DailyClosing.java` — `closingKind`/`sourceKind` 필드 추가, `create()` overload, 기존 메서드 deprecate 주석
- `service/DailyClosingService.java` — `sourceKind` 분기 (SALES_SLIP/PURCHASE_SLIP 신규 집계)
- `web/dto/CreateDailyClosingRequest.java` — `closingKind` + `sourceKind` 필드 (default 매핑)
- `web/dto/DailyClosingResponse.java` — `salesSlipNo`/`sourceSlipNo` 컬럼 추가
- `web/DailyClosingController.java` — query param 분기
- `repository/DailyClosingRepository.java` — `findByClosingDateAndPartnerIdAndClosingKindAndSourceKind`

**Modify (FE):**
- `clients/desktop/src/renderer/routes/DailyClosingPage.tsx` — 일별/월별 토글 제거, 매출/매입/통합 토글 신규, Daily Detail 표 컬럼 확장
- `clients/desktop/src/renderer/components/AppLayout.tsx` (또는 sidebar 컴포넌트) — 회계 트리 갱신
- `clients/desktop/src/renderer/api/accountingApi.ts` — `getDailyClosingDaily(date, kind, sourceKind)` 확장
- `clients/desktop/src/renderer/routes/index.tsx` — 신규 routes 등록

---

## Task 1: BE — DailyClosingKind + DailyClosingSourceKind enum

- [ ] **Step 1**: enum 2개

```java
public enum DailyClosingKind { SALES, PURCHASE }
public enum DailyClosingSourceKind { TAX_INVOICE, SALES_SLIP, PURCHASE_SLIP }
```

- [ ] **Step 2**: Commit `feat(accounting): SAS-5 DailyClosingKind + SourceKind enum`

---

## Task 2: BE — V21 Flyway migration (기존 row backward fill)

- [ ] **Step 1**: SQL

```sql
-- V21: SP-SAS-5 DailyClosing closing_kind + source_kind 컬럼 추가
ALTER TABLE daily_closings ADD COLUMN closing_kind VARCHAR(20);
ALTER TABLE daily_closings ADD COLUMN source_kind VARCHAR(20);

-- 기존 row backward fill (SP-08-6-5 default = SALES + TAX_INVOICE)
UPDATE daily_closings SET closing_kind = 'SALES', source_kind = 'TAX_INVOICE'
WHERE closing_kind IS NULL;

ALTER TABLE daily_closings ALTER COLUMN closing_kind SET NOT NULL;
ALTER TABLE daily_closings ALTER COLUMN source_kind SET NOT NULL;

ALTER TABLE daily_closings ADD CONSTRAINT chk_dc_kind CHECK (closing_kind IN ('SALES', 'PURCHASE'));
ALTER TABLE daily_closings ADD CONSTRAINT chk_dc_source_kind CHECK (source_kind IN ('TAX_INVOICE', 'SALES_SLIP', 'PURCHASE_SLIP'));

CREATE INDEX idx_dc_kind_source ON daily_closings(closing_date, closing_kind, source_kind) WHERE is_deleted = FALSE;
```

- [ ] **Step 2**: Docker bootRun → 기존 row 모두 SALES+TAX_INVOICE 갱신 확인:

```bash
docker exec samhan-postgres psql -U samhan -d accounting_db -c \
  "SELECT closing_kind, source_kind, COUNT(*) FROM daily_closings GROUP BY closing_kind, source_kind;"
```

- [ ] **Step 3**: Commit

---

## Task 3: BE — DailyClosing 도메인 + DTO 확장 (backward-compat)

- [ ] **Step 1**: `DailyClosing.java` 필드 추가:

```java
@Enumerated(EnumType.STRING)
@Column(name = "closing_kind", nullable = false, length = 20)
private DailyClosingKind closingKind;

@Enumerated(EnumType.STRING)
@Column(name = "source_kind", nullable = false, length = 20)
private DailyClosingSourceKind sourceKind;
```

- [ ] **Step 2**: 신규 factory + 기존 `create(...)` deprecate 주석:

```java
/** @deprecated SP-SAS-5 — closingKind/sourceKind 명시 createV2 사용 권장. */
@Deprecated
public static DailyClosing create(LocalDate closingDate, UUID partnerId,
        BigDecimal totalSupply, BigDecimal totalVat, BigDecimal totalAmount, int slipCount) {
    return createV2(closingDate, partnerId, DailyClosingKind.SALES,
            DailyClosingSourceKind.TAX_INVOICE,
            totalSupply, totalVat, totalAmount, slipCount);
}

public static DailyClosing createV2(LocalDate closingDate, UUID partnerId,
        DailyClosingKind closingKind, DailyClosingSourceKind sourceKind,
        BigDecimal totalSupply, BigDecimal totalVat, BigDecimal totalAmount, int slipCount) {
    DailyClosing dc = new DailyClosing();
    dc.closingDate = closingDate;
    dc.partnerId = partnerId;
    dc.closingKind = closingKind;
    dc.sourceKind = sourceKind;
    dc.totalSupply = nullToZero(totalSupply);
    dc.totalVat = nullToZero(totalVat);
    dc.totalAmount = nullToZero(totalAmount);
    dc.slipCount = Math.max(0, slipCount);
    dc.isLocked = false;
    return dc;
}
```

- [ ] **Step 3**: `CreateDailyClosingRequest` 필드 추가 (default `null` → BE 에서 SALES+TAX_INVOICE backward 기본).
- [ ] **Step 4**: `DailyClosingResponse` 에 `salesSlipNo` / `sourceSlipNo` 옵션 컬럼 추가 (List<DailyClosingDetail> 의 detail row).
- [ ] **Step 5**: Build + Commit

---

## Task 4: BE — DailyClosingService source_kind 분기 + 단위 5 tests

- [ ] **Step 1**: 신규 단위 tests:

```java
@Test
void aggregate_sourceKind_TAX_INVOICE_기존_default_PASS() { ... }  // 회귀 가드

@Test
void aggregate_sourceKind_SALES_SLIP_매출전표_POSTED_집계() { ... }

@Test
void aggregate_sourceKind_PURCHASE_SLIP_매입전표_POSTED_집계() { ... }

@Test
void aggregate_closingKind_SALES_sourceKind_PURCHASE_SLIP_혼합_invalid() { ... }
  // SALES closing + PURCHASE_SLIP source = invalid → IllegalArgumentException

@Test
void lock_unlock_기존_동작_PASS() { ... }  // 회귀 가드
```

- [ ] **Step 2**: Implement `DailyClosingService.aggregate(...)` 의 source_kind 분기:

```java
public DailyClosingResponse executeClosing(CreateDailyClosingRequest req, String actorUserId, String actorRole) {
    DailyClosingKind kind = req.closingKind() != null ? req.closingKind() : DailyClosingKind.SALES;
    DailyClosingSourceKind src = req.sourceKind() != null ? req.sourceKind() : DailyClosingSourceKind.TAX_INVOICE;

    AggregationResult agg = switch (src) {
        case TAX_INVOICE -> aggregateFromTaxInvoices(req.closingDate(), req.partnerId());
        case SALES_SLIP -> aggregateFromSalesSlips(req.closingDate(), req.partnerId());
        case PURCHASE_SLIP -> aggregateFromPurchaseSlips(req.closingDate(), req.partnerId());
    };
    // closingKind 와 sourceKind 정합성 검증 (SALES + PURCHASE_SLIP 같은 모순 차단)
    validateKindSourceMatch(kind, src);
    // ... 나머지 기존 로직
}
```

- [ ] **Step 3**: Run tests — PASS (5건)
- [ ] **Step 4**: 기존 SP-08-6-5 단위/IT 회귀 확인 — `DailyClosingServiceTest` 전체 PASS
- [ ] **Step 5**: Commit

---

## Task 5: BE — DailyClosingController query param 분기

- [ ] **Step 1**: `GET /accounting/closings/daily?date=YYYY-MM-DD&kind=SALES&sourceKind=SALES_SLIP` 지원. default = SALES + TAX_INVOICE (backward-compat).
- [ ] **Step 2**: 기존 controller method 시그니처 무변경, 신규 query param 추가만.
- [ ] **Step 3**: IT 회귀 — `DailyClosingControllerIT` 전체 PASS + 신규 sourceKind 케이스 추가.
- [ ] **Step 4**: Commit

---

## Task 6: FE — sales/purchase API client + form 컴포넌트

- [ ] **Step 1**: `salesAccountingSlipApi.ts`:

```typescript
import { apiClient, type ApiEnvelope } from './client'

export interface SalesAccountingSlipResponse {
  slipNo: string
  slipDate: string
  partnerCode: string
  partnerName: string
  taxType: 'TAXABLE' | 'ZERO_RATED' | 'EXEMPT'
  status: 'DRAFT' | 'POSTED' | 'VOIDED'
  totalSupplyAmount: number
  totalVatAmount: number
  totalAmount: number
  memo: string | null
  lines: Array<{
    lineNo: number
    productCode: string | null
    productName: string | null
    qty: number
    unitPrice: number
    supplyAmount: number
    vatAmount: number
    lineTotal: number
    allocations: Array<{
      sourceSlipNo: string
      sourceLineNo: number
      allocatedQty: number
      allocatedAmount: number
    }>
  }>
}

export async function createSalesSlipDraft(req: unknown): Promise<SalesAccountingSlipResponse> {
  const { data } = await apiClient.post<ApiEnvelope<SalesAccountingSlipResponse>>('/admin/sales-slips', req)
  return data.data
}

export async function postSalesSlip(slipNo: string): Promise<void> {
  await apiClient.post(`/admin/sales-slips/${encodeURIComponent(slipNo)}/post`)
}
```

- [ ] **Step 2**: `purchaseAccountingSlipApi.ts` — 대칭
- [ ] **Step 3**: `SalesSlipLineAllocationEditor.tsx` — 출고전표 검색 + line 선택 + sub-amount 슬라이더 + 잔여 표시 + over-allocation 경고
- [ ] **Step 4**: typecheck PASS
- [ ] **Step 5**: Commit

---

## Task 7: FE — SalesAccountingSlipPage + FormPage

- [ ] **Step 1**: 목록 페이지 (필터 + 표 + 액션)
- [ ] **Step 2**: Form 페이지 (헤더 + 출고전표 선택 + line + allocation + 확정/임시저장 버튼)
- [ ] **Step 3**: VITE_MOCK_MODE=1 mock 시나리오 mock.ts 추가
- [ ] **Step 4**: route 등록
- [ ] **Step 5**: typecheck + lint + build PASS
- [ ] **Step 6**: Commit

---

## Task 8: FE — Purchase 페이지 (Sales 미러)

- [ ] **Step 1**: 동일 패턴 copy
- [ ] **Step 2**: Commit

---

## Task 9: FE — TaxInvoiceBatchIssuePage + TaxInvoiceInboundPage

- [ ] **Step 1**: BatchIssue — 매출전표 N장 선택 → 묶음 미리보기 → DRAFT 생성 → 기존 TaxInvoice 흐름 인계
- [ ] **Step 2**: Inbound — 수동 등록 + 매입전표 매칭
- [ ] **Step 3**: 첨부 업로드 (multipart) 컴포넌트
- [ ] **Step 4**: Commit

---

## Task 10: FE — DailyClosingPage 개정 (사용자 명시)

- [ ] **Step 1**: **일별/월별 토글 제거** — 단일 date picker 만 유지.
- [ ] **Step 2**: 매출/매입/통합 종류 토글 추가:

```tsx
<RadioGroup
  data-testid="closing-kind-toggle"
  value={kind}
  onChange={setKind}
  options={[
    { value: 'SALES', label: '매출' },
    { value: 'PURCHASE', label: '매입' },
    { value: 'ALL', label: '통합' },
  ]}
/>
```

- [ ] **Step 3**: source 토글 (sourceKind): TAX_INVOICE / SALES_SLIP / PURCHASE_SLIP — 종류 토글 따라 자동 결정 또는 별도 sub-토글.
- [ ] **Step 4**: Daily Detail 표 컬럼 확장: `taxInvoiceNo` (기존) + `salesSlipNo` / `sourceSlipNo` (신규, source_kind 따라 표시).
- [ ] **Step 5**: typecheck + build PASS + 기존 Playwright 회귀 PASS (default 흐름)
- [ ] **Step 6**: Commit

---

## Task 11: FE — AppLayout 회계 사이드바 트리 갱신 (17건)

- [ ] **Step 1**: 회계 카테고리에 신규 4 메뉴 + 기존 13 메뉴 트리 구조 적용 (spec §7-A-1):

```tsx
const accountingMenu = {
  label: '회계',
  children: [
    { label: '전표', children: [
      { to: '/accounting/sales-slips', label: '매출전표', page: 'accounting.sales-slip.list' },
      { to: '/accounting/purchase-slips', label: '매입전표', page: 'accounting.purchase-slip.list' },
    ]},
    { label: '세금계산서', children: [
      { to: '/accounting/tax-invoices', label: '목록', page: 'accounting.tax-invoice.list' },
      { to: '/accounting/tax-invoices/batch', label: '발행 묶음', page: 'accounting.tax-invoice.batch-issue' },
      { to: '/accounting/tax-invoices/inbound', label: '수신', page: 'accounting.tax-invoice.inbound' },
    ]},
    { label: '마감', children: [
      { to: '/accounting/daily-closing', label: '일마감', page: 'accounting.daily-closing' },
      { to: '/accounting/period-close', label: '월말 마감', page: 'accounting.period-close' },
    ]},
    { label: '원장/조회', children: [
      { to: '/accounting/general-ledger', label: '원장', page: 'accounting.general-ledger' },
      { to: '/accounting/partner-ledger', label: '거래처 원장', page: 'accounting.partner-ledger' },
      { to: '/accounting/journals', label: '분개장', page: 'accounting.journals' },
      { to: '/accounting/balances', label: '시산표', page: 'accounting.balances' },
    ]},
    { label: '기준정보', children: [
      { to: '/accounting/accounts', label: '계정과목', page: 'accounting.accounts' },
    ]},
    { label: '출력/거래', children: [
      { to: '/accounting/statements/batch', label: '거래명세서 일괄', page: 'accounting.statement-batch' },
      { to: '/accounting/deposit-match', label: '입금 매칭', page: 'accounting.deposit-match' },
    ]},
    { to: '/accounting/reports', label: '재무 보고서', page: 'accounting.reports' },
  ],
}
```

- [ ] **Step 2**: 권한 체크 — 각 메뉴는 PageCode 기반 view 권한 확인 후 표시.
- [ ] **Step 3**: typecheck + Playwright 회귀 PASS.
- [ ] **Step 4**: Commit `feat(desktop): SAS-5 회계 사이드바 17건 통합`

---

## Task 12: Playwright E2E

- [ ] **Step 1**: `clients/desktop/playwright/sp-sas/sp-sas.spec.ts` — 15 시나리오 (spec §7-C):
  - S1~S10 매출/매입 전표 워크플로우
  - S11 회귀 일마감 default
  - S12 일마감 sourceKind=SALES_SLIP
  - S13 회계 메뉴 17건 표시
- [ ] **Step 2**: `npx playwright test playwright/sp-sas` → PASS
- [ ] **Step 3**: Commit

---

## Task 13: QA mockup PNG 생성 + scenarios.md

- [ ] **Step 1**: `docs/qa/sp-sas/gen_pngs.py` — SP-08-6-5 패턴 ([feedback_pr_qa_screenshots]) 15 시나리오 mockup PNG 생성
- [ ] **Step 2**: `docs/qa/sp-sas/scenarios.md` — spec §7-C 15 시나리오 + 검증 SQL
- [ ] **Step 3**: PR 본문 인라인 첨부
- [ ] **Step 4**: Commit

---

## Task 14: PM 통합 + dev-report + PR + 5-team

- [ ] **Step 1**: 통합 build

```bash
./gradlew :services:auth-service:test :services:accounting-service:test :services:slip-service:test
cd clients/desktop && npm run typecheck && npm run lint && npm run build
cd clients/desktop && npx playwright test playwright/sp-sas playwright/sp-08-6-5-accounting-daily-ledger
```
Expected: 모두 PASS (기존 SP-08-6-5 회귀 보장)

- [ ] **Step 2**: dev-report `sp-sas-5-admin-ui-daily-closing-revision.md`
- [ ] **Step 3**: handoff §A 갱신 (SAS 시리즈 완료 → MIG-2 진입)
- [ ] **Step 4**: 회계 메모리 갱신 — `.claude/memory/project_sas_accounting_slip.md` 신설
- [ ] **Step 5**: PR + 5-team cycle ([feedback_dual_5agent_review])

---

## 검증 체크리스트

- [ ] BE DailyClosingKind + SourceKind enum
- [ ] BE V21 Flyway + 기존 row backward fill 검증
- [ ] BE DailyClosing 도메인 + DTO + Service + Controller + 5 단위 PASS + 회귀
- [ ] FE sales/purchase API client + form 컴포넌트
- [ ] FE SalesAccountingSlipPage + FormPage
- [ ] FE PurchaseAccountingSlipPage + FormPage
- [ ] FE TaxInvoiceBatchIssuePage + InboundPage
- [ ] FE DailyClosingPage 개정 (일별/월별 토글 제거, 종류 토글 신규)
- [ ] FE AppLayout 사이드바 17건 통합
- [ ] Playwright E2E 15 시나리오 PASS
- [ ] QA mockup PNG + scenarios.md
- [ ] PM 통합 build + dev-report + PR + 5-team cycle
