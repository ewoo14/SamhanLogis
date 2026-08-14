package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.financial.VatAmountCalculator;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 세금계산서 라인 (Phase 10 Step 8 — P0-4 #3).
 *
 * <p>매뉴얼 §1-2 양식 기준: 일자 / 품목 / 규격 / 수량 / 단가 / 공급가액 / 세액 / 비고.
 *
 * <p>금액 계산:
 *
 * <ul>
 *   <li>{@code supplyAmount = quantity * unitPrice} (HALF_UP scale 2)</li>
 *   <li>{@code vatAmount = supplyAmount * 0.10} (공통 원 단위 절사)</li>
 * </ul>
 */
@Entity
@Getter
@Table(name = "tax_invoice_lines")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class TaxInvoiceLine extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tax_invoice_id", nullable = false)
    private TaxInvoice taxInvoice;

    /** 라인 표시 순번 (1-based). */
    @Column(name = "line_no", nullable = false)
    private int lineNo;

    /** 품목명 (≤200자). */
    @Column(name = "item_name", nullable = false, length = 200)
    private String itemName;

    /** 규격 (≤100자, 선택). */
    @Column(name = "spec", length = 100)
    private String spec;

    /**
     * 단위 — 건 / kg / CBM / 박스 등 (≤20자, 선택).
     * P0-4 V11 신규 컬럼. legacy 레코드 = NULL.
     */
    @Column(name = "unit", length = 20)
    private String unit;

    /** 수량 (≥0). */
    @Column(name = "quantity", nullable = false, precision = 15, scale = 2)
    private BigDecimal quantity;

    /** 단가 (≥0). */
    @Column(name = "unit_price", nullable = false, precision = 15, scale = 2)
    private BigDecimal unitPrice;

    /** 공급가액 = quantity * unitPrice (자동 계산). */
    @Column(name = "supply_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal supplyAmount;

    /** 세액 = supplyAmount * 0.10 (공통 원 단위 절사). */
    @Column(name = "vat_amount", nullable = false, precision = 15, scale = 2)
    private BigDecimal vatAmount;

    /** 비고 (≤500자, 선택). */
    @Column(name = "memo", length = 500)
    private String memo;

    /** 출고전표 원천의 모델명 snapshot. */
    @Column(name = "model_name", length = 100)
    private String modelName;

    /** 판매 당시 GAS 카테고리 schedule key snapshot. null은 A-2 UNKNOWN이다. */
    @Column(name = "category_key", length = 40)
    private String categoryKey;

    private TaxInvoiceLine(TaxInvoice taxInvoice, int lineNo, String itemName, String spec,
                           String unit, BigDecimal quantity, BigDecimal unitPrice, String memo) {
        this.taxInvoice = taxInvoice;
        this.lineNo = lineNo;
        this.itemName = itemName;
        this.spec = spec;
        this.unit = unit;
        this.quantity = quantity;
        this.unitPrice = unitPrice;
        this.memo = memo;
        recompute();
    }

    /**
     * 신규 라인 생성 (unit 포함). 금액 자동 계산.
     *
     * @param taxInvoice 부모 세금계산서 (cascade 영속화)
     * @param lineNo 표시 순번 (1 이상)
     * @param itemName 품목명 (1~200자)
     * @param spec 규격 (선택, ≤100자)
     * @param unit 단위 — 건/kg/CBM 등 (선택, ≤20자)
     * @param quantity 수량 (≥0)
     * @param unitPrice 단가 (≥0)
     * @param memo 비고 (선택, ≤500자)
     */
    public static TaxInvoiceLine create(TaxInvoice taxInvoice, int lineNo, String itemName,
                                        String spec, String unit, BigDecimal quantity,
                                        BigDecimal unitPrice, String memo) {
        if (itemName == null || itemName.isBlank() || itemName.length() > 200) {
            throw new IllegalArgumentException("itemName 은 1~200자 필수입니다");
        }
        if (quantity == null || quantity.signum() < 0) {
            throw new IllegalArgumentException("quantity 는 0 이상 필수입니다");
        }
        if (unitPrice == null || unitPrice.signum() < 0) {
            throw new IllegalArgumentException("unitPrice 는 0 이상 필수입니다");
        }
        if (spec != null && spec.length() > 100) {
            throw new IllegalArgumentException("spec 은 최대 100자입니다");
        }
        if (unit != null && unit.length() > 20) {
            throw new IllegalArgumentException("unit 은 최대 20자입니다");
        }
        if (memo != null && memo.length() > 500) {
            throw new IllegalArgumentException("memo 는 최대 500자입니다");
        }
        if (lineNo < 1) {
            throw new IllegalArgumentException("lineNo 는 1 이상 필수입니다");
        }
        return new TaxInvoiceLine(taxInvoice, lineNo, itemName, spec, unit, quantity, unitPrice, memo);
    }

    /**
     * 신규 라인 생성 (금액 스냅샷 지정). 출고전표처럼 라인별 반올림/조정이 끝난 source 의
     * 공급가액/부가세를 세금계산서에 그대로 보존할 때 사용합니다.
     */
    public static TaxInvoiceLine createWithAmounts(TaxInvoice taxInvoice, int lineNo,
                                                   String itemName, String spec, String unit,
                                                   BigDecimal quantity, BigDecimal unitPrice,
                                                   BigDecimal supplyAmount, BigDecimal vatAmount,
                                                   String memo) {
        if (supplyAmount == null || supplyAmount.signum() < 0) {
            throw new IllegalArgumentException("supplyAmount 는 0 이상 필수입니다");
        }
        if (vatAmount == null || vatAmount.signum() < 0) {
            throw new IllegalArgumentException("vatAmount 는 0 이상 필수입니다");
        }
        TaxInvoiceLine line = create(taxInvoice, lineNo, itemName, spec, unit, quantity, unitPrice, memo);
        line.supplyAmount = supplyAmount.setScale(2, RoundingMode.HALF_UP);
        line.vatAmount = vatAmount.setScale(2, RoundingMode.HALF_UP);
        return line;
    }

    /** 출고전표 라인 → 세금계산서 라인 스냅샷 변환. */
    public static TaxInvoiceLine createFromSalesAccountingSlipLine(
            TaxInvoice taxInvoice, int lineNo, SalesAccountingSlipLine sourceLine) {
        if (sourceLine == null) {
            throw new IllegalArgumentException("sourceLine 은 필수입니다");
        }
        String itemName = sourceLine.getProductName();
        if (itemName == null || itemName.isBlank()) {
            itemName = sourceLine.getProductCode();
        }
        if (itemName == null || itemName.isBlank()) {
            itemName = "출고전표 품목";
        }
        String spec = sourceLine.getProductCode();
        TaxInvoiceLine line = createWithAmounts(taxInvoice, lineNo, itemName, spec, null,
                sourceLine.getQty(), sourceLine.getUnitPrice(),
                sourceLine.getSupplyAmount(), sourceLine.getVatAmount(), null);
        line.modelName = sourceLine.getModelName();
        line.categoryKey = sourceLine.getCategoryKey();
        return line;
    }

    /** 혼합 출고전표의 한 배분 축만 세금계산서 라인으로 복사한다. */
    public static TaxInvoiceLine createFromSalesAccountingSlipAllocation(
            TaxInvoice taxInvoice, int lineNo, SalesAccountingSlipLine sourceLine,
            SalesAccountingSlipAllocation allocation) {
        if (sourceLine == null || allocation == null) {
            throw new IllegalArgumentException("sourceLine과 allocation은 필수입니다");
        }
        String itemName = sourceLine.getProductName();
        if (itemName == null || itemName.isBlank()) {
            itemName = sourceLine.getProductCode();
        }
        if (itemName == null || itemName.isBlank()) {
            itemName = "출고전표 품목";
        }
        BigDecimal lineTotal = sourceLine.getLineTotal();
        BigDecimal ratio = lineTotal == null || lineTotal.signum() == 0
                ? BigDecimal.ZERO
                : allocation.getAllocatedAmount().divide(lineTotal, 12, RoundingMode.HALF_UP);
        TaxInvoiceLine line = createWithAmounts(taxInvoice, lineNo, itemName,
                sourceLine.getProductCode(), null, allocation.getAllocatedQty(), sourceLine.getUnitPrice(),
                sourceLine.getSupplyAmount().multiply(ratio),
                sourceLine.getVatAmount().multiply(ratio), null);
        line.modelName = allocation.getModelName();
        line.categoryKey = allocation.getCategoryKey();
        return line;
    }

    /** 입고전표 라인 → 수신 세금계산서 라인 스냅샷 변환. */
    public static TaxInvoiceLine createFromPurchaseAccountingSlipLine(
            TaxInvoice taxInvoice, int lineNo, PurchaseAccountingSlipLine sourceLine) {
        if (sourceLine == null) {
            throw new IllegalArgumentException("sourceLine 은 필수입니다");
        }
        String itemName = sourceLine.getProductName();
        if (itemName == null || itemName.isBlank()) {
            itemName = sourceLine.getProductCode();
        }
        if (itemName == null || itemName.isBlank()) {
            itemName = "입고전표 품목";
        }
        String spec = sourceLine.getProductCode();
        return createWithAmounts(taxInvoice, lineNo, itemName, spec, null,
                sourceLine.getQty(), sourceLine.getUnitPrice(),
                sourceLine.getSupplyAmount(), sourceLine.getVatAmount(), null);
    }

    /**
     * 신규 라인 생성 (unit 생략) — 기존 호출부 하위 호환.
     *
     * @param taxInvoice 부모 세금계산서
     * @param lineNo 표시 순번 (1 이상)
     * @param itemName 품목명 (1~200자)
     * @param spec 규격 (선택, ≤100자)
     * @param quantity 수량 (≥0)
     * @param unitPrice 단가 (≥0)
     * @param memo 비고 (선택, ≤500자)
     */
    public static TaxInvoiceLine create(TaxInvoice taxInvoice, int lineNo, String itemName,
                                        String spec, BigDecimal quantity, BigDecimal unitPrice,
                                        String memo) {
        return create(taxInvoice, lineNo, itemName, spec, null, quantity, unitPrice, memo);
    }

    /** supplyAmount / vatAmount 재계산. */
    private void recompute() {
        this.supplyAmount = this.quantity.multiply(this.unitPrice)
                .setScale(2, RoundingMode.HALF_UP);
        this.vatAmount = VatAmountCalculator.fromSupply(this.supplyAmount).setScale(2);
    }
}
