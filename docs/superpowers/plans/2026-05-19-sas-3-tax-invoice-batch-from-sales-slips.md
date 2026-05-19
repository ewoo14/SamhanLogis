# SP-SAS-3 TaxInvoice Batch From Sales Slips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development

**Goal:** N장의 SalesAccountingSlip (POSTED, 동일 거래처·동일월) → 1장의 TaxInvoice DRAFT 자동 생성 + 기존 ETaxClient (SP-09-1) NTS 홈택스 발행 path 연계.

**Architecture:** 기존 `TaxInvoiceBatchService` 확장 신설 메서드 `createFromSalesSlips(List<UUID>)`. 거래처/월 동일성 가드 (`SAS_PARTNER_MONTH_MISMATCH`). 매출전표 N장 모두 `tax_invoice_id` 동일 UUID 갱신.

**Tech Stack:** Java 17 / Spring Boot 3 / JPA / 기존 TaxInvoice 도메인 재사용

**Spec ref:** §3-D, §4-A [5] 세금계산서 발행 묶음, §6 메뉴, §7-E UI

**Dependency:** SP-SAS-1 머지 완료 (SalesAccountingSlip 도메인)

---

## File Structure

**Create:**
- `service/TaxInvoiceBatchFromSalesSlipsService.java`
- `web/dto/CreateTaxInvoiceFromSalesSlipsRequest.java` (record — `List<UUID> salesSlipIds`)
- `web/dto/TaxInvoiceFromSalesSlipsResponse.java` (record — TaxInvoice id + N매출전표 갱신)
- `test/.../TaxInvoiceBatchFromSalesSlipsServiceTest.java`
- `test/.../TaxInvoiceBatchFromSalesSlipsIT.java`

**Modify:**
- `web/TaxInvoiceBatchController.java` — POST `/admin/tax-invoices/batch-from-sales-slips`
- `auth-service/PageCode.java` — `ACCOUNTING_TAX_INVOICE_BATCH_ISSUE`
- `auth-service/V??__add_tax_invoice_batch_permissions.sql`

---

## Task 1: DTO 2종

- [ ] **Step 1**: `CreateTaxInvoiceFromSalesSlipsRequest`:

```java
package com.samhanair.logis.accounting.web.dto;

import java.util.List;
import java.util.UUID;

public record CreateTaxInvoiceFromSalesSlipsRequest(
        List<UUID> salesSlipIds,
        String issuedDate      // YYYY-MM-DD, 발행일
) {}
```

- [ ] **Step 2**: `TaxInvoiceFromSalesSlipsResponse`:

```java
package com.samhanair.logis.accounting.web.dto;

import java.math.BigDecimal;
import java.util.List;

public record TaxInvoiceFromSalesSlipsResponse(
        String taxInvoiceNo,
        String partnerCode,
        String partnerName,
        BigDecimal totalSupplyAmount,
        BigDecimal totalVatAmount,
        BigDecimal totalAmount,
        int linkedSalesSlipCount,
        List<String> linkedSalesSlipNos
) {}
```

- [ ] **Step 3**: Commit `feat(accounting): SAS-3 DTO 2종`

---

## Task 2: TaxInvoiceBatchFromSalesSlipsService + 단위 4 tests

**Files:** `TaxInvoiceBatchFromSalesSlipsService.java` + test

- [ ] **Step 1**: Failing tests:

```java
@Test
void createFromSalesSlips_N1_묶음_거래처월동일_정상() {
    // N=3 매출전표 (모두 partner=X, slip_date=2026-05)
    // → TaxInvoice 1장 생성, total = sum(N장)
    // → 3장의 tax_invoice_id 모두 동일 UUID
}

@Test
void createFromSalesSlips_거래처_다름_SAS_PARTNER_MONTH_MISMATCH() {
    // partner=X 1장, partner=Y 1장 → 예외
}

@Test
void createFromSalesSlips_월_다름_SAS_PARTNER_MONTH_MISMATCH() {
    // 2026-05 + 2026-06 → 예외
}

@Test
void createFromSalesSlips_이미_링크된_매출전표_SAS_TAX_INVOICE_ALREADY_LINKED() {
    // 1장이 이미 tax_invoice_id != null → 예외
}
```

- [ ] **Step 2**: Run — FAIL

- [ ] **Step 3**: Implement:

```java
package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.repository.SalesAccountingSlipRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.web.dto.CreateTaxInvoiceFromSalesSlipsRequest;
import com.samhanair.logis.accounting.web.dto.TaxInvoiceFromSalesSlipsResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class TaxInvoiceBatchFromSalesSlipsService {

    private final SalesAccountingSlipRepository slipRepository;
    private final TaxInvoiceRepository taxInvoiceRepository;
    private final TaxInvoiceNumberService taxInvoiceNumberService;

    public TaxInvoiceFromSalesSlipsResponse createFromSalesSlips(
            CreateTaxInvoiceFromSalesSlipsRequest req, String actorUserId) {

        List<SalesAccountingSlip> slips = slipRepository.findAllById(req.salesSlipIds());
        if (slips.size() != req.salesSlipIds().size()) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "일부 매출전표를 찾을 수 없습니다");
        }

        // 거래처 / 월 동일성 검증
        UUID firstPartnerId = slips.get(0).getPartnerId();
        YearMonth firstMonth = YearMonth.from(slips.get(0).getSlipDate());
        for (SalesAccountingSlip s : slips) {
            if (!s.getPartnerId().equals(firstPartnerId)) {
                throw new BusinessException(ErrorCode.SAS_PARTNER_MONTH_MISMATCH,
                        "거래처 불일치: " + s.getSlipNo());
            }
            if (!YearMonth.from(s.getSlipDate()).equals(firstMonth)) {
                throw new BusinessException(ErrorCode.SAS_PARTNER_MONTH_MISMATCH,
                        "발행월 불일치: " + s.getSlipNo());
            }
            if (s.getTaxInvoiceId() != null) {
                throw new BusinessException(ErrorCode.SAS_TAX_INVOICE_ALREADY_LINKED,
                        "이미 링크된 매출전표: " + s.getSlipNo());
            }
        }

        // TaxInvoice 합계 = N장 매출전표 합산
        BigDecimal totalSupply = slips.stream().map(SalesAccountingSlip::getTotalSupplyAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalVat = slips.stream().map(SalesAccountingSlip::getTotalVatAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        String taxInvoiceNo = taxInvoiceNumberService.next(LocalDate.parse(req.issuedDate()));

        TaxInvoice ti = TaxInvoice.createDraftFromSalesSlips(
                taxInvoiceNo, LocalDate.parse(req.issuedDate()),
                slips.get(0).getPartnerId(), slips.get(0).getPartnerCode(),
                slips.get(0).getPartnerName(),
                totalSupply, totalVat, totalSupply.add(totalVat),
                actorUserId);
        taxInvoiceRepository.save(ti);

        // 모든 매출전표에 tax_invoice_id 링크
        for (SalesAccountingSlip s : slips) {
            s.linkTaxInvoice(ti.getId());
        }

        return new TaxInvoiceFromSalesSlipsResponse(
                ti.getTaxInvoiceNo(),
                slips.get(0).getPartnerCode(), slips.get(0).getPartnerName(),
                totalSupply, totalVat, totalSupply.add(totalVat),
                slips.size(),
                slips.stream().map(SalesAccountingSlip::getSlipNo).toList());
    }
}
```

> `TaxInvoice.createDraftFromSalesSlips(...)` factory 메서드는 기존 `TaxInvoice` 도메인에 추가 필요 (Step 4).

- [ ] **Step 4**: `TaxInvoice.java` 에 신규 factory 추가:

```java
public static TaxInvoice createDraftFromSalesSlips(String taxInvoiceNo, LocalDate issuedDate,
        UUID partnerId, String partnerCode, String partnerName,
        BigDecimal totalSupply, BigDecimal totalVat, BigDecimal totalAmount,
        String actorUserId) {
    TaxInvoice ti = new TaxInvoice();
    // 기존 createDraft 패턴 따름
    ti.taxInvoiceNo = taxInvoiceNo;
    ti.issuedDate = issuedDate;
    ti.partnerId = partnerId;
    ti.partnerCode = partnerCode;
    ti.partnerName = partnerName;
    ti.totalSupplyAmount = totalSupply;
    ti.totalVatAmount = totalVat;
    ti.totalAmount = totalAmount;
    ti.status = TaxInvoiceStatus.DRAFT;
    ti.issuedBy = actorUserId;
    return ti;
}
```

- [ ] **Step 5**: Run tests — PASS
- [ ] **Step 6**: Commit `feat(accounting): SAS-3 TaxInvoiceBatchFromSalesSlipsService + 4 단위 PASS`

---

## Task 3: TaxInvoiceBatchController endpoint 추가

- [ ] **Step 1**: 기존 `TaxInvoiceBatchController.java` 에 method 추가:

```java
@PostMapping("/batch-from-sales-slips")
@PreAuthorize("hasRole('MASTER')")  // 대량 발행 위험 → MASTER only
public ResponseEntity<TaxInvoiceFromSalesSlipsResponse> createFromSalesSlips(
        @RequestBody CreateTaxInvoiceFromSalesSlipsRequest req,
        @RequestHeader("X-User-Id") String userId) {
    return ResponseEntity.ok(batchFromSalesSlipsService.createFromSalesSlips(req, userId));
}
```

- [ ] **Step 2**: Commit

---

## Task 4: IT — Docker E2E N:1 묶음

- [ ] **Step 1**: `TaxInvoiceBatchFromSalesSlipsIT.java` — 매출전표 3장 미리 적재 (SP-SAS-1 createDraft + post) → POST `/admin/tax-invoices/batch-from-sales-slips` → TaxInvoice 1장 + 3장의 tax_invoice_id 검증.

- [ ] **Step 2**: Run IT — PASS

- [ ] **Step 3**: Commit `test(accounting): SAS-3 IT N:1 묶음 PASS`

---

## Task 5: PageCode + permission

- [ ] **Step 1**: `ACCOUNTING_TAX_INVOICE_BATCH_ISSUE` 등록 + V?? seed (MASTER only)

- [ ] **Step 2**: Commit

---

## Task 6: PM 통합 + dev-report + PR + 5-team

- [ ] **Step 1**: `./gradlew :services:accounting-service:test` → BUILD SUCCESSFUL
- [ ] **Step 2**: dev-report `sp-sas-3-tax-invoice-batch.md`
- [ ] **Step 3**: handoff §A 갱신 (SP-SAS-4 진입)
- [ ] **Step 4**: PR + 5-team cycle

---

## 검증 체크리스트

- [ ] DTO 2종
- [ ] Service 거래처/월 동일성 가드 + 4 단위 PASS
- [ ] TaxInvoice.createDraftFromSalesSlips factory
- [ ] Controller POST /batch-from-sales-slips (MASTER only)
- [ ] IT Docker N:1 묶음 PASS
- [ ] PageCode + permission seed
- [ ] PM 통합 + dev-report + PR + 5-team
