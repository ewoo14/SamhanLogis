# SP-SAS-2 PurchaseAccountingSlip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 입고전표 → 매입전표(PurchaseAccountingSlip) 도메인 신설 — SP-SAS-1 매출전표 100% 대칭. source = 입고전표.

**Architecture:** SP-SAS-1 의 도메인/Service/Controller/IT 패턴을 그대로 미러링. 차이점은 source_slip = INBOUND, 비즈니스 routing path = `/admin/purchase-slips`.

**Tech Stack:** Java 17 / Spring Boot 3 / JPA / Postgres 16 / Flyway / Mockito / Testcontainers

**Spec ref:** §3-A (대칭 명시), §4-B 매입 워크플로우, §6 매입 메뉴

**Dependency:** SP-SAS-1 머지 완료 (SlipServiceClient, VatCalculator, ErrorCode 등 재사용)

---

## File Structure

**Create (Sales 패턴 대칭, "Sales" → "Purchase" 치환):**
- `domain/PurchaseAccountingSlip.java`
- `domain/PurchaseAccountingSlipLine.java`
- `domain/PurchaseAccountingSlipAllocation.java`
- `domain/PurchaseSlipStatus.java` (또는 SalesSlipStatus 공용화 검토 — 아래 Note 참조)
- `repository/PurchaseAccountingSlipRepository.java`
- `repository/PurchaseAccountingSlipAllocationRepository.java`
- `service/PurchaseAccountingSlipService.java`
- `service/PurchaseAccountingSlipNumberGenerator.java`
- `web/PurchaseAccountingSlipController.java`
- `web/dto/CreatePurchaseAccountingSlipRequest.java`
- `web/dto/PurchaseAccountingSlipResponse.java`
- `db/migration/V19__add_purchase_accounting_slips.sql`
- `test/.../PurchaseAccountingSlipServiceTest.java`
- `test/.../PurchaseAccountingSlipControllerIT.java`

**Modify:**
- `auth-service/.../PageCode.java` — `ACCOUNTING_PURCHASE_SLIP_LIST`
- `auth-service/V10__add_purchase_slip_permissions.sql` — 시드

> **Note**: `SalesSlipStatus` / `SalesTaxType` 는 매출 전용 의미 X — 매입 측도 동일 enum 사용 가능. SP-SAS-2 에서 enum 이름을 `SlipStatus` / `SalesTaxType` (taxType 은 매입에도 적용) 으로 일반화하거나, `PurchaseSlipStatus` 별도 신설. 일반화 권장 (DRY).

---

## Task 1: enum 일반화 (선택 — SP-SAS-1 이미 머지 후 적용)

**Files:** Modify `SalesSlipStatus.java` → `AccountingSlipStatus.java` 리네임 (또는 PurchaseSlipStatus 신설)

- [ ] **Step 1**: SP-SAS-1 에 정의된 `SalesSlipStatus` 가 매출 의미 무관 (DRAFT/POSTED/VOIDED). 의사 결정: **DRY 위해 `AccountingSlipStatus` 로 리네임** (또는 별도 `PurchaseSlipStatus` 신설 — 단순 분리 선호 시).
- [ ] **Step 2**: 본 plan 은 단순 분리 선택 — `PurchaseSlipStatus` 신설 (SP-SAS-1 무수정).

```java
package com.samhanair.logis.accounting.domain;

public enum PurchaseSlipStatus { DRAFT, POSTED, VOIDED }
```

- [ ] **Step 3**: Commit

```bash
git commit -am "feat(accounting): PurchaseSlipStatus enum (대칭)"
```

---

## Task 2: Flyway V19 migration

**Files:** `db/migration/V19__add_purchase_accounting_slips.sql`

- [ ] **Step 1**: SQL 작성 — SP-SAS-1 V18 100% 미러, 테이블 이름만 `purchase_*`:

```sql
-- V19: SP-SAS-2 PurchaseAccountingSlip — 입고전표 → 매입전표
CREATE TABLE purchase_accounting_slips (
    id UUID PRIMARY KEY,
    slip_no VARCHAR(50) NOT NULL UNIQUE,
    slip_date DATE NOT NULL,
    partner_id UUID NOT NULL,
    partner_code VARCHAR(100) NOT NULL,
    partner_name VARCHAR(200) NOT NULL,
    tax_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    total_supply_amount NUMERIC(15,2) NOT NULL,
    total_vat_amount NUMERIC(15,2) NOT NULL,
    total_amount NUMERIC(15,2) NOT NULL,
    posted_at TIMESTAMP, posted_by VARCHAR(100),
    tax_invoice_id UUID,
    memo TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL,
    modified_at TIMESTAMP NOT NULL DEFAULT NOW(),
    modified_by VARCHAR(100) NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP, deleted_by VARCHAR(100),
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT chk_pas_tax_type CHECK (tax_type IN ('TAXABLE', 'ZERO_RATED', 'EXEMPT')),
    CONSTRAINT chk_pas_status CHECK (status IN ('DRAFT', 'POSTED', 'VOIDED'))
);

CREATE INDEX idx_pas_slip_date ON purchase_accounting_slips(slip_date) WHERE is_deleted = FALSE;
CREATE INDEX idx_pas_partner_id ON purchase_accounting_slips(partner_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_pas_status ON purchase_accounting_slips(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_pas_tax_invoice_id ON purchase_accounting_slips(tax_invoice_id) WHERE is_deleted = FALSE;

CREATE TABLE purchase_accounting_slip_lines (
    id UUID PRIMARY KEY,
    slip_id UUID NOT NULL REFERENCES purchase_accounting_slips(id),
    line_no INT NOT NULL,
    product_code VARCHAR(100), product_name VARCHAR(200),
    qty NUMERIC(12,3) NOT NULL, unit_price NUMERIC(15,2) NOT NULL,
    supply_amount NUMERIC(15,2) NOT NULL, vat_amount NUMERIC(15,2) NOT NULL,
    line_total NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), created_by VARCHAR(100) NOT NULL,
    modified_at TIMESTAMP NOT NULL DEFAULT NOW(), modified_by VARCHAR(100) NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP, deleted_by VARCHAR(100),
    version BIGINT NOT NULL DEFAULT 0,
    UNIQUE (slip_id, line_no)
);
CREATE INDEX idx_pas_line_slip_id ON purchase_accounting_slip_lines(slip_id) WHERE is_deleted = FALSE;

CREATE TABLE purchase_accounting_slip_allocations (
    id UUID PRIMARY KEY,
    purchase_slip_line_id UUID NOT NULL REFERENCES purchase_accounting_slip_lines(id),
    source_slip_id UUID NOT NULL, source_slip_no VARCHAR(50) NOT NULL,
    source_line_id UUID NOT NULL, source_line_no INT NOT NULL,
    allocated_qty NUMERIC(12,3) NOT NULL, allocated_amount NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(), created_by VARCHAR(100) NOT NULL,
    modified_at TIMESTAMP NOT NULL DEFAULT NOW(), modified_by VARCHAR(100) NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP, deleted_by VARCHAR(100),
    version BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_pas_alloc_source ON purchase_accounting_slip_allocations(source_slip_id, source_line_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_pas_alloc_slip_line ON purchase_accounting_slip_allocations(purchase_slip_line_id) WHERE is_deleted = FALSE;

-- 입고전표 잔여 추적 view
CREATE OR REPLACE VIEW v_inbound_slip_allocation AS
SELECT source_slip_id, source_line_id,
       SUM(allocated_qty) AS allocated_qty_sum,
       SUM(allocated_amount) AS allocated_amount_sum
FROM purchase_accounting_slip_allocations
WHERE is_deleted = FALSE
GROUP BY source_slip_id, source_line_id;
```

- [ ] **Step 2**: Docker bootRun → Flyway 자동 적용 확인
- [ ] **Step 3**: Commit `feat(accounting): SAS V19 — purchase_accounting_slips schema`

---

## Task 3: 도메인 엔티티 3종 (Sales 대칭, 치환)

- [ ] **Step 1**: `PurchaseAccountingSlip.java` 작성 — SP-SAS-1 의 `SalesAccountingSlip.java` 를 복사 후 클래스명/필드명/메서드명 sales → purchase 일괄 치환. `taxType` 은 `SalesTaxType` 재사용 (이미 일반화 가능 enum). `linkTaxInvoice()` 메서드 동일.
- [ ] **Step 2**: `PurchaseAccountingSlipLine.java` — Sales line 미러.
- [ ] **Step 3**: `PurchaseAccountingSlipAllocation.java` — Sales allocation 미러 + 필드명 `salesSlipLine` → `purchaseSlipLine`.
- [ ] **Step 4**: `./gradlew :services:accounting-service:compileJava` → SUCCESS
- [ ] **Step 5**: Commit `feat(accounting): SAS Purchase 도메인 3종 (Sales 대칭)`

---

## Task 4: Repository 2종

- [ ] **Step 1**: `PurchaseAccountingSlipRepository` + `PurchaseAccountingSlipAllocationRepository` — Sales 미러. method 이름만 `outbound` → `inbound`.
- [ ] **Step 2**: 잔여 query `sumAllocatedAmountBySourceLineId` 도 PurchaseAccountingSlipAllocation 으로 dispatch. JPQL 동일.
- [ ] **Step 3**: Commit `feat(accounting): SAS Purchase Repository 2종`

---

## Task 5: SlipServiceClient 확장 — 입고전표 read endpoint

- [ ] **Step 1**: 기존 SP-SAS-1 의 `getSlipLine(lineId)` 가 OUTBOUND/INBOUND 모두 반환 가능하면 변경 무. 만약 OUTBOUND only 라면 INBOUND 도 같은 endpoint 로 통합 (SlipInternalController 의 `/internal/slip-lines/{lineId}` 가 slipType 무관 반환). 검증 후 차이 시 endpoint 분기 또는 `slipType` 필드 노출.
- [ ] **Step 2**: 검증 IT — slip-service 의 INBOUND slip 으로 `getSlipLine` 호출 시 정상 반환.
- [ ] **Step 3**: Commit (변경 없으면 skip)

---

## Task 6: PurchaseAccountingSlipService + 단위 4 tests (Sales 미러)

- [ ] **Step 1**: `PurchaseAccountingSlipServiceTest.java` 작성 — SP-SAS-1 의 `SalesAccountingSlipServiceTest` 4 케이스 미러:
  - `createDraft_1대1_정상생성_VAT자동분리` (입고전표 source)
  - `overAllocation_차단_SAS_OVER_ALLOCATION`
  - `source_slip_not_confirmed_SAS_SOURCE_SLIP_NOT_CONFIRMED`
  - `post_DRAFT_to_POSTED_정상`

- [ ] **Step 2**: `PurchaseAccountingSlipService.java` 작성 — `SalesAccountingSlipService.java` 미러. `verifySourceAndAllocation` 의 SlipLineSnapshot.slipStatus 검증 동일 (CONFIRMED 요구).

- [ ] **Step 3**: `./gradlew :services:accounting-service:test --tests "PurchaseAccountingSlipServiceTest"` → 4 PASS
- [ ] **Step 4**: Commit `feat(accounting): SAS Purchase Service + 단위 4건 PASS`

---

## Task 7: PurchaseAccountingSlipController

- [ ] **Step 1**: `PurchaseAccountingSlipController.java` — POST `/admin/purchase-slips` + `/{slipNo}/post`. SP-SAS-1 미러.
- [ ] **Step 2**: Commit `feat(accounting): SAS Purchase Controller`

---

## Task 8: IT — Docker postgres E2E (Sales 미러)

- [ ] **Step 1**: `PurchaseAccountingSlipControllerIT.java` — SP-SAS-1 IT 미러.
- [ ] **Step 2**: `./gradlew :services:accounting-service:test --tests "PurchaseAccountingSlipControllerIT"` → PASS
- [ ] **Step 3**: Commit

---

## Task 9: PageCode + permission seed

- [ ] **Step 1**: PageCode `ACCOUNTING_PURCHASE_SLIP_LIST` 추가.
- [ ] **Step 2**: `V10__add_purchase_slip_permissions.sql` (auth-service) 시드.
- [ ] **Step 3**: Commit

---

## Task 10: PM 통합 build + dev-report + PR + 5-team cycle

- [ ] **Step 1**: `./gradlew :shared:common:test :services:auth-service:test :services:accounting-service:test :services:slip-service:test` → BUILD SUCCESSFUL
- [ ] **Step 2**: dev-report `sp-sas-2-purchase-accounting-slip.md`
- [ ] **Step 3**: handoff CURRENT-WORK.md 갱신 (SP-SAS-3 진입 명시)
- [ ] **Step 4**: PR + 5-team cycle ([feedback_dual_5agent_review])

---

## 검증 체크리스트

- [ ] PurchaseSlipStatus enum
- [ ] V19 Flyway 3 테이블 + 잔여 view + CHECK
- [ ] 도메인 3종 BaseEntity 7
- [ ] Repository 잔여 query
- [ ] Service over-allocation 가드 + 4 단위 PASS
- [ ] Controller POST + post
- [ ] IT Docker E2E PASS
- [ ] PageCode + permission seed
- [ ] PM 통합 + dev-report + PR + 5-team
