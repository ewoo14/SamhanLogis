# SP-SAS-4 TaxInvoice Inbound + Purchase Slip Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development

**Goal:** 공급자(거래처)가 발행한 전자세금계산서를 수신/등록하고 매입전표(PurchaseAccountingSlip)와 매칭. 옵션 A (NTS 수신 API) 또는 옵션 B (관리자 수동 등록 — PDF/이미지 첨부, OCR 후속).

**Architecture:** TaxInvoice 도메인의 `direction` 확장 (`OUTBOUND` 발행 / `INBOUND` 수신). 수신 TaxInvoice 1장 ↔ N장의 PurchaseAccountingSlip 매칭 (allocation 패턴 미러).

**Tech Stack:** Java 17 / Spring Boot 3 / JPA / MinIO (첨부)

**Spec ref:** §4-B [5] 세금계산서 수신, §6 메뉴, §7-F UI

**Dependency:** SP-SAS-2 머지 완료 (PurchaseAccountingSlip 도메인)

---

## File Structure

**Create:**
- `service/TaxInvoiceInboundService.java`
- `web/TaxInvoiceInboundController.java`
- `web/dto/RegisterInboundTaxInvoiceRequest.java`
- `web/dto/InboundTaxInvoiceResponse.java`
- `db/migration/V20__add_tax_invoice_direction.sql`
- `test/.../TaxInvoiceInboundServiceTest.java`
- `test/.../TaxInvoiceInboundControllerIT.java`

**Modify:**
- `domain/TaxInvoice.java` — `direction ENUM (OUTBOUND/INBOUND)` 필드 추가, factory `createInbound(...)` 추가
- `domain/TaxInvoiceDirection.java` 신규 enum
- `domain/PurchaseAccountingSlip.java` — 본인 매칭된 inbound tax_invoice_id 는 이미 컬럼 보유 (SP-SAS-2 V19 에서 추가됨), method `linkInboundTaxInvoice()` 추가
- `auth-service/PageCode.java` — `ACCOUNTING_TAX_INVOICE_INBOUND`
- `auth-service/V??__add_inbound_tax_invoice_permissions.sql`

---

## Task 1: Flyway V20 — TaxInvoice direction 컬럼

- [ ] **Step 1**: SQL

```sql
-- V20: TaxInvoice direction 확장 — OUTBOUND(기존 발행) / INBOUND(수신)
ALTER TABLE tax_invoices ADD COLUMN direction VARCHAR(20) NOT NULL DEFAULT 'OUTBOUND';
ALTER TABLE tax_invoices ADD CONSTRAINT chk_ti_direction CHECK (direction IN ('OUTBOUND', 'INBOUND'));
CREATE INDEX idx_ti_direction ON tax_invoices(direction) WHERE is_deleted = FALSE;

-- 첨부 파일 (수동 등록 시 PDF/이미지 — MinIO presigned URL ref)
CREATE TABLE inbound_tax_invoice_attachments (
    id UUID PRIMARY KEY,
    tax_invoice_id UUID NOT NULL REFERENCES tax_invoices(id),
    filename VARCHAR(255) NOT NULL,
    minio_object_key VARCHAR(500) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL,
    modified_at TIMESTAMP NOT NULL DEFAULT NOW(),
    modified_by VARCHAR(100) NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP, deleted_by VARCHAR(100),
    version BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_inbound_ti_att_ti ON inbound_tax_invoice_attachments(tax_invoice_id) WHERE is_deleted = FALSE;
```

- [ ] **Step 2**: Docker bootRun → Flyway 적용 확인
- [ ] **Step 3**: Commit

---

## Task 2: TaxInvoiceDirection enum + TaxInvoice 도메인 확장

- [ ] **Step 1**: `TaxInvoiceDirection.java`:

```java
public enum TaxInvoiceDirection {
    OUTBOUND,  // 우리가 발행 (매출 측)
    INBOUND    // 거래처가 발행 → 우리가 수신 (매입 측)
}
```

- [ ] **Step 2**: `TaxInvoice.java` 에 `direction` 필드 + `createInbound()` factory:

```java
@Enumerated(EnumType.STRING)
@Column(name = "direction", nullable = false, length = 20)
private TaxInvoiceDirection direction;

public static TaxInvoice createInbound(String taxInvoiceNo, LocalDate issuedDate,
        UUID partnerId, String partnerCode, String partnerName,
        BigDecimal totalSupply, BigDecimal totalVat, BigDecimal totalAmount,
        String actorUserId) {
    TaxInvoice ti = new TaxInvoice();
    ti.taxInvoiceNo = taxInvoiceNo;
    ti.issuedDate = issuedDate;
    ti.partnerId = partnerId;
    ti.partnerCode = partnerCode;
    ti.partnerName = partnerName;
    ti.totalSupplyAmount = totalSupply;
    ti.totalVatAmount = totalVat;
    ti.totalAmount = totalAmount;
    ti.status = TaxInvoiceStatus.DRAFT;
    ti.direction = TaxInvoiceDirection.INBOUND;
    ti.issuedBy = actorUserId;
    return ti;
}
```

기존 `createDraft` / `createDraftFromSalesSlips` 도 `direction = OUTBOUND` 명시.

- [ ] **Step 3**: Commit

---

## Task 3: TaxInvoiceInboundService + 단위 3 tests

- [ ] **Step 1**: tests:

```java
@Test
void registerInbound_정상_DRAFT_생성() { ... }

@Test
void registerInbound_with_purchaseSlipIds_매칭_link() {
    // PurchaseAccountingSlip 3장 → 1 inbound TaxInvoice 매칭, tax_invoice_id 갱신
}

@Test
void registerInbound_거래처_다른_매입전표_SAS_PARTNER_MONTH_MISMATCH() { ... }
```

- [ ] **Step 2**: Implement service (SP-SAS-3 의 batchFromSalesSlips 미러, OUTBOUND→INBOUND 치환)

- [ ] **Step 3**: PASS + Commit

---

## Task 4: Controller + 첨부 업로드 endpoint

- [ ] **Step 1**: POST `/admin/tax-invoices/inbound` (JSON body) + POST `/admin/tax-invoices/inbound/{id}/attachments` (multipart PDF/이미지)
- [ ] **Step 2**: 권한 ACCOUNTANT/MASTER
- [ ] **Step 3**: Commit

---

## Task 5: IT Docker E2E

- [ ] **Step 1**: PurchaseAccountingSlip 미리 적재 → POST inbound TaxInvoice + 매칭 → tax_invoice_id 검증
- [ ] **Step 2**: Run IT — PASS
- [ ] **Step 3**: Commit

---

## Task 6: PageCode + permission

- [ ] **Step 1**: `ACCOUNTING_TAX_INVOICE_INBOUND` 등록 + V?? seed (ACCOUNTANT/MASTER)
- [ ] **Step 2**: Commit

---

## Task 7: PM 통합 + dev-report + PR + 5-team

- [ ] **Step 1**: BUILD SUCCESSFUL
- [ ] **Step 2**: dev-report `sp-sas-4-tax-invoice-inbound.md`
- [ ] **Step 3**: handoff §A 갱신 (SP-SAS-5 진입)
- [ ] **Step 4**: PR + 5-team cycle

---

## 검증 체크리스트

- [ ] V20 Flyway — direction 컬럼 + 첨부 테이블
- [ ] TaxInvoiceDirection enum + createInbound factory
- [ ] Service 매칭 가드 + 3 단위 PASS
- [ ] Controller POST inbound + attachment multipart
- [ ] IT Docker E2E PASS
- [ ] PageCode + permission seed
- [ ] PM 통합 + dev-report + PR + 5-team

---

## 후속 옵션 (out-of-scope, 별도 슬라이스)

- **NTS 수신 API** — 공급자 발행 전자세금계산서 자동 수신 (별도 SP-SAS-4-NTS-RECV 슬라이스)
- **OCR 자동 파싱** — 수동 등록 PDF/이미지 → TaxInvoice 필드 자동 추출 (별도 SP-SAS-4-OCR 슬라이스)
