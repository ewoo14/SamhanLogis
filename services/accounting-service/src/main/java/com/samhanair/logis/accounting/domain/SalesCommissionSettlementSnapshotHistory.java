package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/** 확정 취소 시 보관하는 영업수수료 정산 snapshot 감사 이력. */
@Entity
@Getter
@Table(name = "sales_commission_settlement_snapshot_histories")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SalesCommissionSettlementSnapshotHistory extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "settlement_id", nullable = false, updatable = false)
    private SalesCommissionSettlement settlement;

    @Column(name = "document_no", nullable = false, length = 40, updatable = false)
    private String confirmedDocumentNo;

    @Column(name = "settlement_date", nullable = false, updatable = false)
    private LocalDate confirmedSettlementDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "rate_contract_id", updatable = false)
    private SalesCommissionRateContract rateContract;

    @Column(name = "total_amount", precision = 24, scale = 6, updatable = false)
    private BigDecimal totalAmount;
    @Column(name = "equipment_amount", precision = 24, scale = 6, updatable = false)
    private BigDecimal equipmentAmount;
    @Column(name = "prepaid_amount", precision = 24, scale = 6, updatable = false)
    private BigDecimal prepaidAmount;
    @Column(name = "install_input_amount", precision = 24, scale = 6, updatable = false)
    private BigDecimal installInputAmount;
    @Column(name = "safety_input_amount", precision = 24, scale = 6, updatable = false)
    private BigDecimal safetyInputAmount;
    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method", length = 20, updatable = false)
    private SalesCommissionPaymentMethod paymentMethod;
    @Column(name = "withholding_applied", updatable = false)
    private Boolean withholdingApplied;
    @Column(name = "manual_expense_rate", precision = 19, scale = 8, updatable = false)
    private BigDecimal manualExpenseRate;
    @Column(name = "applied_expense_rate", precision = 19, scale = 8, updatable = false)
    private BigDecimal appliedExpenseRate;
    @Column(name = "card_amount", precision = 24, scale = 6, updatable = false)
    private BigDecimal cardAmount;
    @Column(name = "sales_amount", precision = 24, scale = 6, updatable = false)
    private BigDecimal salesAmount;
    @Column(name = "expense_amount", precision = 24, scale = 6, updatable = false)
    private BigDecimal expenseAmount;
    @Column(name = "withholding_amount", precision = 24, scale = 6, updatable = false)
    private BigDecimal withholdingAmount;
    @Column(name = "install_amount", precision = 24, scale = 6, updatable = false)
    private BigDecimal installAmount;
    @Column(name = "safety_amount", precision = 24, scale = 6, updatable = false)
    private BigDecimal safetyAmount;
    @Column(name = "subtotal_amount", precision = 24, scale = 6, updatable = false)
    private BigDecimal subtotalAmount;
    @Column(name = "payout_amount", precision = 24, scale = 6, updatable = false)
    private BigDecimal payoutAmount;
    @Column(name = "supply_amount", precision = 24, scale = 6, updatable = false)
    private BigDecimal supplyAmount;
    @Column(name = "vat_amount", precision = 24, scale = 6, updatable = false)
    private BigDecimal vatAmount;

    private SalesCommissionSettlementSnapshotHistory(SalesCommissionSettlement settlement) {
        this.settlement = settlement;
        this.confirmedDocumentNo = settlement.getDocumentNo();
        this.confirmedSettlementDate = settlement.getSettlementDate();
        this.rateContract = settlement.getRateContract();
        this.totalAmount = settlement.getTotalAmount();
        this.equipmentAmount = settlement.getEquipmentAmount();
        this.prepaidAmount = settlement.getPrepaidAmount();
        this.installInputAmount = settlement.getInstallInputAmount();
        this.safetyInputAmount = settlement.getSafetyInputAmount();
        this.paymentMethod = settlement.getPaymentMethod();
        this.withholdingApplied = settlement.getWithholdingApplied();
        this.manualExpenseRate = settlement.getManualExpenseRate();
        this.appliedExpenseRate = settlement.getAppliedExpenseRate();
        this.cardAmount = settlement.getCardAmount();
        this.salesAmount = settlement.getSalesAmount();
        this.expenseAmount = settlement.getExpenseAmount();
        this.withholdingAmount = settlement.getWithholdingAmount();
        this.installAmount = settlement.getInstallAmount();
        this.safetyAmount = settlement.getSafetyAmount();
        this.subtotalAmount = settlement.getSubtotalAmount();
        this.payoutAmount = settlement.getPayoutAmount();
        this.supplyAmount = settlement.getSupplyAmount();
        this.vatAmount = settlement.getVatAmount();
    }

    /** 확정 취소 직전 정산서 snapshot을 새 감사 행으로 복사한다. */
    public static SalesCommissionSettlementSnapshotHistory capture(SalesCommissionSettlement settlement) {
        if (settlement == null || settlement.getDocumentNo() == null) {
            throw new IllegalArgumentException("확정된 정산서와 문서번호가 필요합니다");
        }
        return new SalesCommissionSettlementSnapshotHistory(settlement);
    }
}
