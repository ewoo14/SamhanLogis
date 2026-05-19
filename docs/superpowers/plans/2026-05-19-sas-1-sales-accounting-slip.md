# SP-SAS-1 SalesAccountingSlip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 출고전표 → 매출전표(SalesAccountingSlip, 회계분개) 도메인 신설 — 관리자 수동 트리거, N:M flexible 매핑, Line + Sub-amount 분할, VAT 자동 분리 (TAXABLE/ZERO_RATED/EXEMPT), 잔여 표시 + over-allocation 차단.

**Architecture:** accounting-service 내부 신규 도메인 (cross-DB 최소). slip-service 는 read-only Feign client 호출만 (역방향 의존 없음, slip-service 무수정). VAT 분리 RoundingMode.FLOOR (한국 관례). state: DRAFT → POSTED → VOIDED.

**Tech Stack:** Java 17 / Spring Boot 3 / JPA / Postgres 16 / Flyway / Mockito / Testcontainers / OpenFeign

**Spec ref:** [`docs/superpowers/specs/2026-05-19-sales-purchase-accounting-slip-design.md`](../specs/2026-05-19-sales-purchase-accounting-slip-design.md) §3 (도메인), §4-A (워크플로우 매출 측), §5 (VAT), §6 (에러), §7-B (UI 매출전표 작성)

---

## File Structure

**Create:**
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesAccountingSlip.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesAccountingSlipLine.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesAccountingSlipAllocation.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesSlipStatus.java` (enum DRAFT/POSTED/VOIDED)
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesTaxType.java` (enum TAXABLE/ZERO_RATED/EXEMPT)
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/SalesAccountingSlipRepository.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/SalesAccountingSlipAllocationRepository.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/VatCalculator.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesAccountingSlipService.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/SlipServiceClient.java` (Feign)
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/client/SlipLineSnapshot.java` (read-only DTO from slip-service)
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/SalesAccountingSlipController.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/CreateSalesAccountingSlipRequest.java`
- `services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/SalesAccountingSlipResponse.java`
- `services/accounting-service/src/main/resources/db/migration/V18__add_sales_accounting_slips.sql`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/VatCalculatorTest.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/SalesAccountingSlipServiceTest.java`
- `services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/SalesAccountingSlipControllerIT.java`

**Modify:**
- `shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java` — `SAS_*` 9건 추가 (§5-A)
- `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java` — `ACCOUNTING_SALES_SLIP_LIST` 추가
- `services/auth-service/src/main/resources/db/migration/V9__add_sas_page_permissions.sql` — role 시드

> **Flyway 버전**: V18 가정 (실 배정 시 accounting-service `db/migration/` 최신 버전 +1).

---

## Task 1: ErrorCode 9건 추가

**Files:**
- Modify: `shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java`

- [ ] **Step 1: Write the failing test**

`shared/common/src/test/java/com/samhanair/logis/common/exception/ErrorCodeSasTest.java`:

```java
package com.samhanair.logis.common.exception;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

class ErrorCodeSasTest {

    @Test
    void sas_errorCodes_정상등록() {
        assertThat(ErrorCode.SAS_SOURCE_SLIP_NOT_FOUND.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(ErrorCode.SAS_SOURCE_SLIP_NOT_CONFIRMED.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.SAS_OVER_ALLOCATION.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.SAS_LINE_AMOUNT_MISMATCH.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.SAS_TAX_TYPE_MIXED.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(ErrorCode.SAS_ALREADY_POSTED.getStatus()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ErrorCode.SAS_DAILY_CLOSING_LOCKED.getStatus()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ErrorCode.SAS_TAX_INVOICE_ALREADY_LINKED.getStatus()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ErrorCode.SAS_PARTNER_MONTH_MISMATCH.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

`./gradlew :shared:common:test --tests "ErrorCodeSasTest"` → FAIL ("cannot find symbol SAS_*")

- [ ] **Step 3: Add 9 enum values**

`ErrorCode.java` 파일 끝의 enum 정의에 추가 (기존 enum 형식 보존):

```java
SAS_SOURCE_SLIP_NOT_FOUND(HttpStatus.NOT_FOUND, "SAS_SOURCE_SLIP_NOT_FOUND", "출고/입고전표를 찾을 수 없습니다"),
SAS_SOURCE_SLIP_NOT_CONFIRMED(HttpStatus.UNPROCESSABLE_ENTITY, "SAS_SOURCE_SLIP_NOT_CONFIRMED", "출고/입고전표가 CONFIRMED 상태가 아닙니다"),
SAS_OVER_ALLOCATION(HttpStatus.UNPROCESSABLE_ENTITY, "SAS_OVER_ALLOCATION", "할당 합계가 출고/입고전표 line 잔여를 초과합니다"),
SAS_LINE_AMOUNT_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY, "SAS_LINE_AMOUNT_MISMATCH", "line 의 공급가액+부가세가 line_total 과 다릅니다"),
SAS_TAX_TYPE_MIXED(HttpStatus.UNPROCESSABLE_ENTITY, "SAS_TAX_TYPE_MIXED", "단일 매출/매입전표 내 line 단위 tax_type 혼합은 금지됩니다"),
SAS_ALREADY_POSTED(HttpStatus.CONFLICT, "SAS_ALREADY_POSTED", "이미 POSTED 된 전표는 수정할 수 없습니다"),
SAS_DAILY_CLOSING_LOCKED(HttpStatus.CONFLICT, "SAS_DAILY_CLOSING_LOCKED", "해당 일자 일마감이 잠겨 있습니다"),
SAS_TAX_INVOICE_ALREADY_LINKED(HttpStatus.CONFLICT, "SAS_TAX_INVOICE_ALREADY_LINKED", "이미 세금계산서와 매핑된 매출전표입니다"),
SAS_PARTNER_MONTH_MISMATCH(HttpStatus.UNPROCESSABLE_ENTITY, "SAS_PARTNER_MONTH_MISMATCH", "묶음 발행 시 거래처 또는 발행월이 일치하지 않습니다"),
```

- [ ] **Step 4: Run test to verify PASS**

`./gradlew :shared:common:test --tests "ErrorCodeSasTest"` → PASS

- [ ] **Step 5: Commit**

```bash
git add shared/common/src/main/java/com/samhanair/logis/common/exception/ErrorCode.java \
        shared/common/src/test/java/com/samhanair/logis/common/exception/ErrorCodeSasTest.java
git commit -m "feat(common): SAS ErrorCode 9건 추가 (D-SAS §5-A)"
```

---

## Task 2: 도메인 enum SalesSlipStatus + SalesTaxType

**Files:**
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesSlipStatus.java`
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesTaxType.java`

- [ ] **Step 1: Create SalesSlipStatus**

```java
package com.samhanair.logis.accounting.domain;

public enum SalesSlipStatus {
    /** 작성 중 — 자유 수정. */
    DRAFT,
    /** 확정 — 회계 분개 확정. DailyClosing 미잠금일 때만 VOIDED 가능. */
    POSTED,
    /** 무효화. */
    VOIDED
}
```

- [ ] **Step 2: Create SalesTaxType**

```java
package com.samhanair.logis.accounting.domain;

public enum SalesTaxType {
    /** 과세 (10% VAT). */
    TAXABLE,
    /** 영세율 (0% VAT, 세금계산서 의무). */
    ZERO_RATED,
    /** 면세 (VAT 없음, 면세계산서 별도). */
    EXEMPT
}
```

- [ ] **Step 3: Commit**

```bash
git add services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesSlipStatus.java \
        services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesTaxType.java
git commit -m "feat(accounting): SAS enum SalesSlipStatus/SalesTaxType"
```

---

## Task 3: VatCalculator (TDD)

**Files:**
- Test: `services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/VatCalculatorTest.java`
- Create: `services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/VatCalculator.java`

- [ ] **Step 1: Write the failing tests**

```java
package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import com.samhanair.logis.accounting.domain.SalesTaxType;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class VatCalculatorTest {

    @Test
    void taxable_단가_150000_qty_10_VAT포함_분리정확() {
        // qty * unitPrice = 1,500,000 (VAT-inclusive)
        // supply = floor(1,500,000 * 100 / 110) = 1,363,636
        // vat   = 1,500,000 - 1,363,636 = 136,364
        VatCalculator.Result r = VatCalculator.split(
                new BigDecimal("10"), new BigDecimal("150000"), SalesTaxType.TAXABLE);

        assertThat(r.supplyAmount()).isEqualByComparingTo("1363636");
        assertThat(r.vatAmount()).isEqualByComparingTo("136364");
        assertThat(r.lineTotal()).isEqualByComparingTo("1500000");
    }

    @Test
    void zero_rated_VAT_0_supply_전체() {
        VatCalculator.Result r = VatCalculator.split(
                new BigDecimal("5"), new BigDecimal("100000"), SalesTaxType.ZERO_RATED);

        assertThat(r.supplyAmount()).isEqualByComparingTo("500000");
        assertThat(r.vatAmount()).isEqualByComparingTo("0");
        assertThat(r.lineTotal()).isEqualByComparingTo("500000");
    }

    @Test
    void exempt_면세_VAT_0_supply_전체() {
        VatCalculator.Result r = VatCalculator.split(
                new BigDecimal("3"), new BigDecimal("200000"), SalesTaxType.EXEMPT);

        assertThat(r.supplyAmount()).isEqualByComparingTo("600000");
        assertThat(r.vatAmount()).isEqualByComparingTo("0");
        assertThat(r.lineTotal()).isEqualByComparingTo("600000");
    }

    @Test
    void floor_round_정확성_소수_단가() {
        // unit 1100 × qty 1 = 1100, supply = floor(1100 * 100 / 110) = 1000, vat = 100
        VatCalculator.Result r = VatCalculator.split(
                new BigDecimal("1"), new BigDecimal("1100"), SalesTaxType.TAXABLE);

        assertThat(r.supplyAmount()).isEqualByComparingTo("1000");
        assertThat(r.vatAmount()).isEqualByComparingTo("100");
    }
}
```

- [ ] **Step 2: Run tests — FAIL (VatCalculator not defined)**

`./gradlew :services:accounting-service:test --tests "VatCalculatorTest"` → FAIL

- [ ] **Step 3: Implement VatCalculator**

```java
package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.SalesTaxType;
import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * VAT-inclusive 단가 → 공급가액 + 부가세 분리 (한국 회계 관례, RoundingMode.FLOOR).
 *
 * <p>출고/입고전표 단가는 VAT-inclusive. 매출/매입전표 line 변환 시 본 calculator 호출.
 *
 * <p>공식:
 * <ul>
 *   <li>TAXABLE: supply = floor(qty × unitPrice × 100 / 110), vat = lineTotal - supply</li>
 *   <li>ZERO_RATED / EXEMPT: supply = lineTotal, vat = 0</li>
 * </ul>
 */
public final class VatCalculator {

    private static final BigDecimal HUNDRED = new BigDecimal("100");
    private static final BigDecimal ONE_TEN = new BigDecimal("110");

    private VatCalculator() {}

    public record Result(BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal lineTotal) {}

    public static Result split(BigDecimal qty, BigDecimal unitPrice, SalesTaxType taxType) {
        BigDecimal lineTotal = qty.multiply(unitPrice);
        return switch (taxType) {
            case TAXABLE -> {
                BigDecimal supply = lineTotal.multiply(HUNDRED)
                                             .divide(ONE_TEN, 0, RoundingMode.FLOOR);
                BigDecimal vat = lineTotal.subtract(supply);
                yield new Result(supply, vat, lineTotal);
            }
            case ZERO_RATED, EXEMPT -> new Result(lineTotal, BigDecimal.ZERO, lineTotal);
        };
    }
}
```

- [ ] **Step 4: Run tests — PASS**

`./gradlew :services:accounting-service:test --tests "VatCalculatorTest"` → 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/VatCalculator.java \
        services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/VatCalculatorTest.java
git commit -m "feat(accounting): SAS VatCalculator (TAXABLE/ZERO_RATED/EXEMPT, FLOOR)"
```

---

## Task 4: Flyway V18 migration

**Files:**
- Create: `services/accounting-service/src/main/resources/db/migration/V18__add_sales_accounting_slips.sql`

- [ ] **Step 1: SQL 작성**

```sql
-- V18: SP-SAS-1 SalesAccountingSlip 도메인 — 출고전표 → 매출전표(회계분개)
-- spec: docs/superpowers/specs/2026-05-19-sales-purchase-accounting-slip-design.md §3

CREATE TABLE sales_accounting_slips (
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
    posted_at TIMESTAMP,
    posted_by VARCHAR(100),
    tax_invoice_id UUID,
    memo TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL,
    modified_at TIMESTAMP NOT NULL DEFAULT NOW(),
    modified_by VARCHAR(100) NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(100),
    version BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT chk_sas_tax_type CHECK (tax_type IN ('TAXABLE', 'ZERO_RATED', 'EXEMPT')),
    CONSTRAINT chk_sas_status CHECK (status IN ('DRAFT', 'POSTED', 'VOIDED'))
);

CREATE INDEX idx_sas_slip_date ON sales_accounting_slips(slip_date) WHERE is_deleted = FALSE;
CREATE INDEX idx_sas_partner_id ON sales_accounting_slips(partner_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_sas_status ON sales_accounting_slips(status) WHERE is_deleted = FALSE;
CREATE INDEX idx_sas_tax_invoice_id ON sales_accounting_slips(tax_invoice_id) WHERE is_deleted = FALSE;

CREATE TABLE sales_accounting_slip_lines (
    id UUID PRIMARY KEY,
    slip_id UUID NOT NULL REFERENCES sales_accounting_slips(id),
    line_no INT NOT NULL,
    product_code VARCHAR(100),
    product_name VARCHAR(200),
    qty NUMERIC(12,3) NOT NULL,
    unit_price NUMERIC(15,2) NOT NULL,
    supply_amount NUMERIC(15,2) NOT NULL,
    vat_amount NUMERIC(15,2) NOT NULL,
    line_total NUMERIC(15,2) NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL,
    modified_at TIMESTAMP NOT NULL DEFAULT NOW(),
    modified_by VARCHAR(100) NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(100),
    version BIGINT NOT NULL DEFAULT 0,

    UNIQUE (slip_id, line_no)
);

CREATE INDEX idx_sas_line_slip_id ON sales_accounting_slip_lines(slip_id) WHERE is_deleted = FALSE;

CREATE TABLE sales_accounting_slip_allocations (
    id UUID PRIMARY KEY,
    sales_slip_line_id UUID NOT NULL REFERENCES sales_accounting_slip_lines(id),
    source_slip_id UUID NOT NULL,
    source_slip_no VARCHAR(50) NOT NULL,
    source_line_id UUID NOT NULL,
    source_line_no INT NOT NULL,
    allocated_qty NUMERIC(12,3) NOT NULL,
    allocated_amount NUMERIC(15,2) NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL,
    modified_at TIMESTAMP NOT NULL DEFAULT NOW(),
    modified_by VARCHAR(100) NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP,
    deleted_by VARCHAR(100),
    version BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_sas_alloc_source ON sales_accounting_slip_allocations(source_slip_id, source_line_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_sas_alloc_slip_line ON sales_accounting_slip_allocations(sales_slip_line_id) WHERE is_deleted = FALSE;

-- 잔여 추적 view (slip-service 무수정)
CREATE OR REPLACE VIEW v_outbound_slip_allocation AS
SELECT
    source_slip_id,
    source_line_id,
    SUM(allocated_qty)    AS allocated_qty_sum,
    SUM(allocated_amount) AS allocated_amount_sum
FROM sales_accounting_slip_allocations
WHERE is_deleted = FALSE
GROUP BY source_slip_id, source_line_id;
```

- [ ] **Step 2: Run accounting-service bootRun (Docker postgres) — Flyway 적용 확인**

```bash
docker exec samhan-postgres psql -U samhan -d accounting_db -c "\d sales_accounting_slips"
```
Expected: 테이블 + 인덱스 3건 + status/tax_type CHECK 표시

- [ ] **Step 3: Commit**

```bash
git add services/accounting-service/src/main/resources/db/migration/V18__add_sales_accounting_slips.sql
git commit -m "feat(accounting): SAS V18 Flyway — sales_accounting_slips + lines + allocations + view"
```

---

## Task 5: 도메인 엔티티 SalesAccountingSlip + Line + Allocation

**Files:**
- Create: `SalesAccountingSlip.java` / `SalesAccountingSlipLine.java` / `SalesAccountingSlipAllocation.java`

- [ ] **Step 1: SalesAccountingSlip 엔티티 (BaseEntity 7 audit, soft-delete @SQLRestriction)**

```java
package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 매출전표 (회계 분개) — 출고전표 source 와 N:M 매핑.
 *
 * <p>spec: 2026-05-19-sales-purchase-accounting-slip-design.md §3-A
 */
@Entity
@Getter
@Table(name = "sales_accounting_slips")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SalesAccountingSlip extends BaseEntity {

    @Id @GeneratedValue @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "slip_no", nullable = false, unique = true, length = 50)
    private String slipNo;

    @Column(name = "slip_date", nullable = false)
    private LocalDate slipDate;

    @Column(name = "partner_id", nullable = false)
    private UUID partnerId;

    @Column(name = "partner_code", nullable = false, length = 100)
    private String partnerCode;

    @Column(name = "partner_name", nullable = false, length = 200)
    private String partnerName;

    @Enumerated(EnumType.STRING)
    @Column(name = "tax_type", nullable = false, length = 20)
    private SalesTaxType taxType;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private SalesSlipStatus status;

    @Column(name = "total_supply_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalSupplyAmount;

    @Column(name = "total_vat_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalVatAmount;

    @Column(name = "total_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal totalAmount;

    @Column(name = "posted_at") private LocalDateTime postedAt;
    @Column(name = "posted_by", length = 100) private String postedBy;
    @Column(name = "tax_invoice_id") private UUID taxInvoiceId;
    @Column(name = "memo", columnDefinition = "TEXT") private String memo;

    @OneToMany(mappedBy = "slip", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SalesAccountingSlipLine> lines = new ArrayList<>();

    public static SalesAccountingSlip createDraft(String slipNo, LocalDate slipDate,
            UUID partnerId, String partnerCode, String partnerName,
            SalesTaxType taxType, String memo) {
        SalesAccountingSlip s = new SalesAccountingSlip();
        s.slipNo = slipNo;
        s.slipDate = slipDate;
        s.partnerId = partnerId;
        s.partnerCode = partnerCode;
        s.partnerName = partnerName;
        s.taxType = taxType;
        s.status = SalesSlipStatus.DRAFT;
        s.totalSupplyAmount = BigDecimal.ZERO;
        s.totalVatAmount = BigDecimal.ZERO;
        s.totalAmount = BigDecimal.ZERO;
        s.memo = memo;
        return s;
    }

    public void recalcTotals() {
        this.totalSupplyAmount = lines.stream().map(SalesAccountingSlipLine::getSupplyAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        this.totalVatAmount = lines.stream().map(SalesAccountingSlipLine::getVatAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        this.totalAmount = totalSupplyAmount.add(totalVatAmount);
    }

    public void post(String actorUserId) {
        if (this.status != SalesSlipStatus.DRAFT) {
            throw new BusinessException(ErrorCode.SAS_ALREADY_POSTED,
                    "DRAFT 상태에서만 POST 가능: " + slipNo + " (현재=" + status + ")");
        }
        this.status = SalesSlipStatus.POSTED;
        this.postedAt = LocalDateTime.now();
        this.postedBy = actorUserId;
    }

    public void voidSlip(String actorUserId) {
        if (this.status == SalesSlipStatus.VOIDED) return;
        this.status = SalesSlipStatus.VOIDED;
    }

    public void linkTaxInvoice(UUID taxInvoiceId) {
        if (this.taxInvoiceId != null) {
            throw new BusinessException(ErrorCode.SAS_TAX_INVOICE_ALREADY_LINKED,
                    "이미 세금계산서와 매핑됨: " + slipNo);
        }
        this.taxInvoiceId = taxInvoiceId;
    }
}
```

- [ ] **Step 2: SalesAccountingSlipLine 엔티티**

```java
package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Getter
@Table(name = "sales_accounting_slip_lines",
       uniqueConstraints = @UniqueConstraint(columnNames = {"slip_id", "line_no"}))
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SalesAccountingSlipLine extends BaseEntity {

    @Id @GeneratedValue @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "slip_id", nullable = false)
    private SalesAccountingSlip slip;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    @Column(name = "product_code", length = 100) private String productCode;
    @Column(name = "product_name", length = 200) private String productName;

    @Column(name = "qty", nullable = false, precision = 12, scale = 3)
    private BigDecimal qty;
    @Column(name = "unit_price", nullable = false, precision = 15, scale = 2)
    private BigDecimal unitPrice;
    @Column(name = "supply_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal supplyAmount;
    @Column(name = "vat_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal vatAmount;
    @Column(name = "line_total", nullable = false, precision = 15, scale = 2)
    private BigDecimal lineTotal;

    @OneToMany(mappedBy = "salesSlipLine", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<SalesAccountingSlipAllocation> allocations = new ArrayList<>();

    public static SalesAccountingSlipLine create(SalesAccountingSlip slip, int lineNo,
            String productCode, String productName,
            BigDecimal qty, BigDecimal unitPrice,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal lineTotal) {
        SalesAccountingSlipLine l = new SalesAccountingSlipLine();
        l.slip = slip;
        l.lineNo = lineNo;
        l.productCode = productCode;
        l.productName = productName;
        l.qty = qty;
        l.unitPrice = unitPrice;
        l.supplyAmount = supplyAmount;
        l.vatAmount = vatAmount;
        l.lineTotal = lineTotal;
        return l;
    }
}
```

- [ ] **Step 3: SalesAccountingSlipAllocation 엔티티**

```java
package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Getter
@Table(name = "sales_accounting_slip_allocations")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SalesAccountingSlipAllocation extends BaseEntity {

    @Id @GeneratedValue @UuidGenerator
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sales_slip_line_id", nullable = false)
    private SalesAccountingSlipLine salesSlipLine;

    @Column(name = "source_slip_id", nullable = false) private UUID sourceSlipId;
    @Column(name = "source_slip_no", nullable = false, length = 50) private String sourceSlipNo;
    @Column(name = "source_line_id", nullable = false) private UUID sourceLineId;
    @Column(name = "source_line_no", nullable = false) private int sourceLineNo;
    @Column(name = "allocated_qty", nullable = false, precision = 12, scale = 3) private BigDecimal allocatedQty;
    @Column(name = "allocated_amount", nullable = false, precision = 15, scale = 2) private BigDecimal allocatedAmount;

    public static SalesAccountingSlipAllocation create(SalesAccountingSlipLine line,
            UUID sourceSlipId, String sourceSlipNo, UUID sourceLineId, int sourceLineNo,
            BigDecimal allocatedQty, BigDecimal allocatedAmount) {
        SalesAccountingSlipAllocation a = new SalesAccountingSlipAllocation();
        a.salesSlipLine = line;
        a.sourceSlipId = sourceSlipId;
        a.sourceSlipNo = sourceSlipNo;
        a.sourceLineId = sourceLineId;
        a.sourceLineNo = sourceLineNo;
        a.allocatedQty = allocatedQty;
        a.allocatedAmount = allocatedAmount;
        return a;
    }
}
```

- [ ] **Step 4: Build compile 확인**

`./gradlew :services:accounting-service:compileJava` → SUCCESS

- [ ] **Step 5: Commit**

```bash
git add services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesAccountingSlip.java \
        services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesAccountingSlipLine.java \
        services/accounting-service/src/main/java/com/samhanair/logis/accounting/domain/SalesAccountingSlipAllocation.java
git commit -m "feat(accounting): SAS 도메인 3종 (Slip + Line + Allocation) JPA 매핑"
```

---

## Task 6: Repository 2종

**Files:**
- Create: `SalesAccountingSlipRepository.java`, `SalesAccountingSlipAllocationRepository.java`

- [ ] **Step 1: SalesAccountingSlipRepository**

```java
package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SalesAccountingSlipRepository extends JpaRepository<SalesAccountingSlip, UUID> {
    Optional<SalesAccountingSlip> findBySlipNo(String slipNo);
    List<SalesAccountingSlip> findBySlipDateAndStatus(LocalDate slipDate, SalesSlipStatus status);
    List<SalesAccountingSlip> findByPartnerIdAndSlipDateBetween(UUID partnerId, LocalDate from, LocalDate to);
    List<SalesAccountingSlip> findByTaxInvoiceId(UUID taxInvoiceId);
}
```

- [ ] **Step 2: SalesAccountingSlipAllocationRepository — 잔여 추적 query**

```java
package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.SalesAccountingSlipAllocation;
import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SalesAccountingSlipAllocationRepository extends JpaRepository<SalesAccountingSlipAllocation, UUID> {

    /**
     * 특정 출고전표 line 에 이미 할당된 금액 합계.
     * over-allocation 가드 트랜잭션에서 호출.
     */
    @Query("""
        SELECT COALESCE(SUM(a.allocatedAmount), 0)
        FROM SalesAccountingSlipAllocation a
        WHERE a.sourceLineId = :sourceLineId
          AND a.isDeleted = false
        """)
    BigDecimal sumAllocatedAmountBySourceLineId(@Param("sourceLineId") UUID sourceLineId);

    @Query("""
        SELECT COALESCE(SUM(a.allocatedQty), 0)
        FROM SalesAccountingSlipAllocation a
        WHERE a.sourceLineId = :sourceLineId
          AND a.isDeleted = false
        """)
    BigDecimal sumAllocatedQtyBySourceLineId(@Param("sourceLineId") UUID sourceLineId);
}
```

- [ ] **Step 3: Build + Commit**

```bash
./gradlew :services:accounting-service:compileJava
git add services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/SalesAccountingSlipRepository.java \
        services/accounting-service/src/main/java/com/samhanair/logis/accounting/repository/SalesAccountingSlipAllocationRepository.java
git commit -m "feat(accounting): SAS Repository 2종 (Slip + Allocation 잔여 query)"
```

---

## Task 7: SlipServiceClient (Feign, read-only)

**Files:**
- Create: `SlipServiceClient.java`, `SlipLineSnapshot.java`

- [ ] **Step 1: SlipLineSnapshot record**

```java
package com.samhanair.logis.accounting.client;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * slip-service 의 출고전표 line read-only snapshot DTO.
 * accounting-service 가 매출전표 생성 시 검증/매핑용으로 조회.
 */
public record SlipLineSnapshot(
        UUID slipId,
        String slipNo,
        UUID lineId,
        int lineNo,
        String productCode,
        String productName,
        BigDecimal qty,
        BigDecimal unitPrice,    // VAT-inclusive
        BigDecimal lineTotal,    // = qty × unitPrice
        String slipStatus        // CONFIRMED 만 매출전표 source 사용 가능
) {}
```

- [ ] **Step 2: SlipServiceClient Feign**

```java
package com.samhanair.logis.accounting.client;

import java.util.List;
import java.util.UUID;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@FeignClient(name = "slip-service", url = "${slip-service.base-url:http://slip-service:8080}")
public interface SlipServiceClient {

    @GetMapping("/internal/slips/{slipId}/lines")
    List<SlipLineSnapshot> getSlipLines(@PathVariable("slipId") UUID slipId);

    @GetMapping("/internal/slip-lines/{lineId}")
    SlipLineSnapshot getSlipLine(@PathVariable("lineId") UUID lineId);
}
```

> **Note**: slip-service 가 본 internal endpoint 를 제공해야 함. SP-SAS-1 plan 범위에서는 slip-service 측 endpoint 추가도 별도 task 로 포함하거나, 본 슬라이스 BE 작업 시 slip-service `SlipInternalController` 에 라우트 추가.

- [ ] **Step 3: slip-service 측 internal endpoint 추가**

`services/slip-service/src/main/java/com/samhanair/logis/slip/web/SlipInternalController.java` 에 method 추가:

```java
@GetMapping("/internal/slips/{slipId}/lines")
public List<SlipLineSnapshot> getSlipLines(@PathVariable UUID slipId) {
    Slip slip = slipRepository.findById(slipId)
            .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "slip not found"));
    return slip.getLines().stream().map(line -> new SlipLineSnapshot(
            slip.getId(), slip.getSlipNo(),
            line.getId(), line.getLineNo(),
            line.getProductCode(), line.getProductName(),
            line.getQty(), line.getUnitPrice(),
            line.getQty().multiply(line.getUnitPrice()),
            slip.getStatus().name()
    )).toList();
}
```

(SlipLineSnapshot 은 shared/common 로 이동 또는 slip-service contract package 신설)

- [ ] **Step 4: Build + Commit**

```bash
./gradlew :services:accounting-service:compileJava :services:slip-service:compileJava
git commit -am "feat(slip+accounting): SlipServiceClient Feign + SlipInternalController read-only endpoint"
```

---

## Task 8: SalesAccountingSlipService (TDD with @MockBean)

**Files:**
- Test: `SalesAccountingSlipServiceTest.java`
- Create: `SalesAccountingSlipService.java`, `CreateSalesAccountingSlipRequest.java`, `SalesAccountingSlipResponse.java`

- [ ] **Step 1: Request/Response DTO**

```java
// CreateSalesAccountingSlipRequest.java
public record CreateSalesAccountingSlipRequest(
        LocalDate slipDate,
        UUID partnerId,
        String partnerCode,
        String partnerName,
        SalesTaxType taxType,
        String memo,
        List<LineRequest> lines
) {
    public record LineRequest(
            String productCode,
            String productName,
            BigDecimal qty,
            BigDecimal unitPrice,           // VAT-inclusive
            List<AllocationRequest> allocations
    ) {}

    public record AllocationRequest(
            UUID sourceSlipId,
            String sourceSlipNo,
            UUID sourceLineId,
            int sourceLineNo,
            BigDecimal allocatedQty,
            BigDecimal allocatedAmount       // VAT-inclusive
    ) {}
}
```

```java
// SalesAccountingSlipResponse.java
public record SalesAccountingSlipResponse(
        String slipNo,                // 사용자 노출
        LocalDate slipDate,
        String partnerCode,
        String partnerName,
        String taxType,
        String status,
        BigDecimal totalSupplyAmount,
        BigDecimal totalVatAmount,
        BigDecimal totalAmount,
        String memo,
        List<LineResponse> lines
) {
    public record LineResponse(
            int lineNo, String productCode, String productName,
            BigDecimal qty, BigDecimal unitPrice,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal lineTotal,
            List<AllocationResponse> allocations
    ) {}
    public record AllocationResponse(
            String sourceSlipNo, int sourceLineNo,
            BigDecimal allocatedQty, BigDecimal allocatedAmount
    ) {}
}
```

- [ ] **Step 2: Failing tests**

```java
package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.client.SlipLineSnapshot;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.*;
import com.samhanair.logis.accounting.repository.*;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.SalesAccountingSlipResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.invocation.InvocationOnMock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SalesAccountingSlipServiceTest {

    @Mock SalesAccountingSlipRepository slipRepository;
    @Mock SalesAccountingSlipAllocationRepository allocationRepository;
    @Mock SlipServiceClient slipServiceClient;
    @Mock SalesAccountingSlipNumberGenerator numberGenerator;
    @InjectMocks SalesAccountingSlipService service;

    @Test
    void createDraft_1대1_정상생성_VAT자동분리() {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(numberGenerator.next(LocalDate.of(2026, 5, 19))).thenReturn("SAS-2026-05-0001");
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-2026-05-0042", sourceLineId, 1,
                "RX다배관", "RX다배관 30A", new BigDecimal("10"),
                new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED"));
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId)).thenReturn(BigDecimal.ZERO);
        lenient().when(slipRepository.save(any(SalesAccountingSlip.class)))
                .thenAnswer((InvocationOnMock inv) -> inv.getArgument(0));

        CreateSalesAccountingSlipRequest req = new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), UUID.randomUUID(), "P-2026-0001", "(주)한국공조",
                SalesTaxType.TAXABLE, "테스트",
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        "RX다배관", "RX다배관 30A", new BigDecimal("10"), new BigDecimal("150000"),
                        List.of(new CreateSalesAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "OUT-2026-05-0042", sourceLineId, 1,
                                new BigDecimal("10"), new BigDecimal("1500000")))
                )));

        SalesAccountingSlipResponse resp = service.createDraft(req, "actor-1");

        assertThat(resp.slipNo()).isEqualTo("SAS-2026-05-0001");
        assertThat(resp.status()).isEqualTo("DRAFT");
        assertThat(resp.totalSupplyAmount()).isEqualByComparingTo("1363636");
        assertThat(resp.totalVatAmount()).isEqualByComparingTo("136364");
        assertThat(resp.totalAmount()).isEqualByComparingTo("1500000");
    }

    @Test
    void overAllocation_차단_SAS_OVER_ALLOCATION() {
        UUID sourceLineId = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                UUID.randomUUID(), "OUT-...", sourceLineId, 1, null, null,
                new BigDecimal("10"), new BigDecimal("150000"),
                new BigDecimal("1500000"), "CONFIRMED"));
        // 이미 800,000 할당됨
        when(allocationRepository.sumAllocatedAmountBySourceLineId(sourceLineId))
                .thenReturn(new BigDecimal("800000"));

        // 추가 800,000 요청 → 합 1,600,000 > 1,500,000 초과
        CreateSalesAccountingSlipRequest req = new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), UUID.randomUUID(), "P-X", "X",
                SalesTaxType.TAXABLE, null,
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        null, null, new BigDecimal("5"), new BigDecimal("160000"),
                        List.of(new CreateSalesAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "OUT-X", sourceLineId, 1,
                                new BigDecimal("5"), new BigDecimal("800000")))
                )));

        assertThatThrownBy(() -> service.createDraft(req, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("잔여를 초과");
    }

    @Test
    void source_slip_not_confirmed_SAS_SOURCE_SLIP_NOT_CONFIRMED() {
        UUID sourceLineId = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                UUID.randomUUID(), "OUT-...", sourceLineId, 1, null, null,
                new BigDecimal("10"), new BigDecimal("100000"),
                new BigDecimal("1000000"), "DRAFT"));

        CreateSalesAccountingSlipRequest req = new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), UUID.randomUUID(), "P-X", "X",
                SalesTaxType.TAXABLE, null,
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        null, null, new BigDecimal("1"), new BigDecimal("100000"),
                        List.of(new CreateSalesAccountingSlipRequest.AllocationRequest(
                                UUID.randomUUID(), "OUT-X", sourceLineId, 1,
                                new BigDecimal("1"), new BigDecimal("100000")))
                )));

        assertThatThrownBy(() -> service.createDraft(req, "actor-1"))
                .isInstanceOf(BusinessException.class)
                .hasMessage(ErrorCode.SAS_SOURCE_SLIP_NOT_CONFIRMED.getMessage()
                        + " (slip=OUT-... 상태=DRAFT)");
    }

    @Test
    void post_DRAFT_to_POSTED_정상() {
        SalesAccountingSlip slip = SalesAccountingSlip.createDraft("SAS-X", LocalDate.now(),
                UUID.randomUUID(), "P-1", "X", SalesTaxType.TAXABLE, null);
        when(slipRepository.findBySlipNo("SAS-X")).thenReturn(Optional.of(slip));

        service.post("SAS-X", "actor-1");

        assertThat(slip.getStatus()).isEqualTo(SalesSlipStatus.POSTED);
        assertThat(slip.getPostedBy()).isEqualTo("actor-1");
    }
}
```

- [ ] **Step 3: Run tests — FAIL (Service not implemented)**

`./gradlew :services:accounting-service:test --tests "SalesAccountingSlipServiceTest"` → FAIL

- [ ] **Step 4: Implement SalesAccountingSlipService**

```java
package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.client.SlipLineSnapshot;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.*;
import com.samhanair.logis.accounting.repository.*;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest.AllocationRequest;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest.LineRequest;
import com.samhanair.logis.accounting.web.dto.SalesAccountingSlipResponse;
import com.samhanair.logis.accounting.web.dto.SalesAccountingSlipResponse.AllocationResponse;
import com.samhanair.logis.accounting.web.dto.SalesAccountingSlipResponse.LineResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class SalesAccountingSlipService {

    private final SalesAccountingSlipRepository slipRepository;
    private final SalesAccountingSlipAllocationRepository allocationRepository;
    private final SlipServiceClient slipServiceClient;
    private final SalesAccountingSlipNumberGenerator numberGenerator;

    public SalesAccountingSlipResponse createDraft(CreateSalesAccountingSlipRequest req, String actorUserId) {
        String slipNo = numberGenerator.next(req.slipDate());
        SalesAccountingSlip slip = SalesAccountingSlip.createDraft(
                slipNo, req.slipDate(), req.partnerId(), req.partnerCode(),
                req.partnerName(), req.taxType(), req.memo());

        int lineNo = 0;
        for (LineRequest lr : req.lines()) {
            lineNo++;
            VatCalculator.Result vat = VatCalculator.split(lr.qty(), lr.unitPrice(), req.taxType());
            SalesAccountingSlipLine line = SalesAccountingSlipLine.create(
                    slip, lineNo, lr.productCode(), lr.productName(),
                    lr.qty(), lr.unitPrice(),
                    vat.supplyAmount(), vat.vatAmount(), vat.lineTotal());
            slip.getLines().add(line);

            for (AllocationRequest ar : lr.allocations()) {
                verifySourceAndAllocation(ar);
                line.getAllocations().add(SalesAccountingSlipAllocation.create(line,
                        ar.sourceSlipId(), ar.sourceSlipNo(),
                        ar.sourceLineId(), ar.sourceLineNo(),
                        ar.allocatedQty(), ar.allocatedAmount()));
            }
        }

        slip.recalcTotals();
        slipRepository.save(slip);
        return toResponse(slip);
    }

    public void post(String slipNo, String actorUserId) {
        SalesAccountingSlip slip = slipRepository.findBySlipNo(slipNo)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND, "매출전표 없음: " + slipNo));
        slip.post(actorUserId);
    }

    private void verifySourceAndAllocation(AllocationRequest ar) {
        SlipLineSnapshot src = slipServiceClient.getSlipLine(ar.sourceLineId());
        if (!"CONFIRMED".equals(src.slipStatus())) {
            throw new BusinessException(ErrorCode.SAS_SOURCE_SLIP_NOT_CONFIRMED,
                    "(slip=" + src.slipNo() + " 상태=" + src.slipStatus() + ")");
        }
        BigDecimal already = allocationRepository.sumAllocatedAmountBySourceLineId(ar.sourceLineId());
        BigDecimal next = already.add(ar.allocatedAmount());
        if (next.compareTo(src.lineTotal()) > 0) {
            throw new BusinessException(ErrorCode.SAS_OVER_ALLOCATION,
                    "(slip=" + src.slipNo() + " line#" + src.lineNo()
                    + " 잔여를 초과: 요청=" + ar.allocatedAmount()
                    + ", 잔여=" + src.lineTotal().subtract(already) + ")");
        }
    }

    private SalesAccountingSlipResponse toResponse(SalesAccountingSlip s) {
        List<LineResponse> lines = s.getLines().stream().map(l -> new LineResponse(
                l.getLineNo(), l.getProductCode(), l.getProductName(),
                l.getQty(), l.getUnitPrice(),
                l.getSupplyAmount(), l.getVatAmount(), l.getLineTotal(),
                l.getAllocations().stream().map(a -> new AllocationResponse(
                        a.getSourceSlipNo(), a.getSourceLineNo(),
                        a.getAllocatedQty(), a.getAllocatedAmount())).toList()
        )).toList();
        return new SalesAccountingSlipResponse(s.getSlipNo(), s.getSlipDate(),
                s.getPartnerCode(), s.getPartnerName(), s.getTaxType().name(), s.getStatus().name(),
                s.getTotalSupplyAmount(), s.getTotalVatAmount(), s.getTotalAmount(),
                s.getMemo(), lines);
    }
}
```

- [ ] **Step 5: SalesAccountingSlipNumberGenerator (간단 stub)**

```java
package com.samhanair.logis.accounting.service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import org.springframework.stereotype.Component;

@Component
public class SalesAccountingSlipNumberGenerator {
    /** 운영 cycle 2 에서 DB sequence 기반 generator 로 교체. PoC = timestamp. */
    public String next(LocalDate date) {
        return "SAS-" + date.format(DateTimeFormatter.ofPattern("yyyy-MM"))
                + "-" + String.format("%04d", (int)(System.currentTimeMillis() % 10000));
    }
}
```

- [ ] **Step 6: Run tests — PASS**

`./gradlew :services:accounting-service:test --tests "SalesAccountingSlipServiceTest"` → 4 tests PASS

- [ ] **Step 7: Commit**

```bash
git add services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesAccountingSlipService.java \
        services/accounting-service/src/main/java/com/samhanair/logis/accounting/service/SalesAccountingSlipNumberGenerator.java \
        services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/CreateSalesAccountingSlipRequest.java \
        services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/dto/SalesAccountingSlipResponse.java \
        services/accounting-service/src/test/java/com/samhanair/logis/accounting/service/SalesAccountingSlipServiceTest.java
git commit -m "feat(accounting): SAS Service + DTO + 단위 테스트 4건 PASS"
```

---

## Task 9: SalesAccountingSlipController

**Files:**
- Create: `SalesAccountingSlipController.java`

- [ ] **Step 1: Controller**

```java
package com.samhanair.logis.accounting.web;

import com.samhanair.logis.accounting.service.SalesAccountingSlipService;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest;
import com.samhanair.logis.accounting.web.dto.SalesAccountingSlipResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/admin/sales-slips")
@RequiredArgsConstructor
public class SalesAccountingSlipController {

    private final SalesAccountingSlipService service;

    @PostMapping
    @PreAuthorize("hasAnyRole('ACCOUNTANT', 'MASTER')")
    public ResponseEntity<SalesAccountingSlipResponse> createDraft(
            @RequestBody CreateSalesAccountingSlipRequest req,
            @RequestHeader("X-User-Id") String userId) {
        return ResponseEntity.ok(service.createDraft(req, userId));
    }

    @PostMapping("/{slipNo}/post")
    @PreAuthorize("hasAnyRole('ACCOUNTANT', 'MASTER')")
    public ResponseEntity<Void> post(@PathVariable String slipNo,
            @RequestHeader("X-User-Id") String userId) {
        service.post(slipNo, userId);
        return ResponseEntity.noContent().build();
    }
}
```

- [ ] **Step 2: Build + compileTestJava 확인**

`./gradlew :services:accounting-service:compileJava :services:accounting-service:compileTestJava` → SUCCESS

- [ ] **Step 3: Commit**

```bash
git add services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/SalesAccountingSlipController.java
git commit -m "feat(accounting): SAS Controller (POST /admin/sales-slips + /:slipNo/post)"
```

---

## Task 10: IT — Docker postgres E2E

**Files:**
- Test: `SalesAccountingSlipControllerIT.java`

- [ ] **Step 1: IT 작성 (Testcontainers + @MockBean SlipServiceClient/PartnerLookupClient 외 외부 client)**

```java
package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.client.SlipLineSnapshot;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.web.dto.CreateSalesAccountingSlipRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.result.MockMvcResultMatchers;

@SpringBootTest
@ActiveProfiles("test")
class SalesAccountingSlipControllerIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper om;
    @MockBean SlipServiceClient slipServiceClient;

    @Test
    void POST_admin_sales_slips_DRAFT_정상생성() throws Exception {
        UUID sourceSlipId = UUID.randomUUID();
        UUID sourceLineId = UUID.randomUUID();
        when(slipServiceClient.getSlipLine(sourceLineId)).thenReturn(new SlipLineSnapshot(
                sourceSlipId, "OUT-2026-05-0042", sourceLineId, 1,
                "RX다배관", "RX다배관 30A", new BigDecimal("10"),
                new BigDecimal("150000"), new BigDecimal("1500000"), "CONFIRMED"));

        CreateSalesAccountingSlipRequest req = new CreateSalesAccountingSlipRequest(
                LocalDate.of(2026, 5, 19), UUID.randomUUID(), "P-2026-0001", "(주)한국공조",
                com.samhanair.logis.accounting.domain.SalesTaxType.TAXABLE, "IT 테스트",
                List.of(new CreateSalesAccountingSlipRequest.LineRequest(
                        "RX다배관", "RX다배관 30A", new BigDecimal("10"), new BigDecimal("150000"),
                        List.of(new CreateSalesAccountingSlipRequest.AllocationRequest(
                                sourceSlipId, "OUT-2026-05-0042", sourceLineId, 1,
                                new BigDecimal("10"), new BigDecimal("1500000"))))));

        mvc.perform(MockMvcRequestBuilders.post("/admin/sales-slips")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-User-Id", "it-tester")
                .header("X-User-Role", "MASTER")
                .content(om.writeValueAsString(req)))
            .andExpect(MockMvcResultMatchers.status().isOk())
            .andExpect(MockMvcResultMatchers.jsonPath("$.status").value("DRAFT"))
            .andExpect(MockMvcResultMatchers.jsonPath("$.totalSupplyAmount").value(1363636))
            .andExpect(MockMvcResultMatchers.jsonPath("$.totalVatAmount").value(136364));
    }
}
```

- [ ] **Step 2: Run IT (Docker postgres + Testcontainers)**

`./gradlew :services:accounting-service:test --tests "SalesAccountingSlipControllerIT"` → PASS

- [ ] **Step 3: Commit**

```bash
git add services/accounting-service/src/test/java/com/samhanair/logis/accounting/it/SalesAccountingSlipControllerIT.java
git commit -m "test(accounting): SAS IT — POST /admin/sales-slips Docker postgres E2E"
```

---

## Task 11: PageCode + auth-service permission seed

**Files:**
- Modify: `services/auth-service/src/main/java/com/samhanair/logis/auth/domain/PageCode.java`
- Create: `services/auth-service/src/main/resources/db/migration/V9__add_sas_page_permissions.sql`

- [ ] **Step 1: Add PageCode enum**

`PageCode.java` 에 `ACCOUNTING_SALES_SLIP_LIST("accounting.sales-slip.list", "매출전표"),` 추가.

- [ ] **Step 2: Permission seed migration**

```sql
-- V9__add_sas_page_permissions.sql
INSERT INTO role_page_permissions (id, role, page_code, can_view, can_edit, created_at, created_by, modified_at, modified_by, is_deleted, version) VALUES
  (gen_random_uuid(), 'ACCOUNTANT', 'accounting.sales-slip.list', true, true, NOW(), 'system', NOW(), 'system', false, 0),
  (gen_random_uuid(), 'MANAGER',    'accounting.sales-slip.list', true, true, NOW(), 'system', NOW(), 'system', false, 0),
  (gen_random_uuid(), 'MASTER',     'accounting.sales-slip.list', true, true, NOW(), 'system', NOW(), 'system', false, 0),
  (gen_random_uuid(), 'SALES',      'accounting.sales-slip.list', true, false, NOW(), 'system', NOW(), 'system', false, 0)
ON CONFLICT DO NOTHING;
```

(Actual V?? 번호는 auth-service 최신 +1)

- [ ] **Step 3: Build + Commit**

```bash
./gradlew :services:auth-service:test
git commit -am "feat(auth): SAS PageCode + role_page_permissions seed"
```

---

## Task 12: PM 통합 build check + dev-report + PR 발행

- [ ] **Step 1: 통합 build**

```bash
./gradlew :shared:common:test :services:auth-service:test :services:accounting-service:test :services:slip-service:test
```
Expected: BUILD SUCCESSFUL

- [ ] **Step 2: dev-report 작성**

`docs/dev-reports/sp-sas-1-sales-accounting-slip.md` (Phase 1~9 양식 따름) — 산출 / 결정 (D-SAS-01~07 + VAT) / 실 적재 결과 (12+ 단위 + IT PASS) / 회귀 가드 / 후속 plan 참조.

- [ ] **Step 3: handoff CURRENT-WORK.md 최상단 §A 갱신**

본 슬라이스 머지 후 다음 슬라이스 SP-SAS-2 (PurchaseAccountingSlip) 진입 명시.

- [ ] **Step 4: PR 발행 + 5-team review cycle**

`feedback_dual_5agent_review` 1 사이클: Claude 5-team → Claude fix → Codex 5-team → Codex fix → CI green → 자동 머지.

---

## 검증 체크리스트

- [ ] ErrorCode 9건 등록 (Task 1)
- [ ] VatCalculator FLOOR + 3 tax_type (Task 3)
- [ ] V18 Flyway — 3 테이블 + 잔여 view + CHECK constraint (Task 4)
- [ ] 도메인 3종 (Slip + Line + Allocation) BaseEntity 7 audit (Task 5)
- [ ] Repository 잔여 query (Task 6)
- [ ] SlipServiceClient Feign read-only (Task 7)
- [ ] Service over-allocation 가드 + 4 단위 테스트 PASS (Task 8)
- [ ] Controller POST + post (Task 9)
- [ ] IT Docker postgres E2E PASS (Task 10)
- [ ] PageCode + permission seed (Task 11)
- [ ] PM 통합 build + dev-report + PR + 5-team cycle (Task 12)
