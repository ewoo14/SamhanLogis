package com.samhanair.logis.accounting.domain;

import com.samhanair.logis.common.entity.BaseEntity;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * 영업수수료 정산서의 문서 생명주기와 업무 식별자를 보관하는 S1 aggregate.
 *
 * <p>계산 snapshot은 DRAFT에서만 기록한다. 확정 취소는 명시적 상태 전이이며,
 * 취소된 확정본은 별도 history aggregate로 보관하고 재확정 전 새 계산을 요구한다.
 */
@Entity
@Getter
@Table(name = "sales_commission_settlements")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class SalesCommissionSettlement extends BaseEntity {

    private static final int DOCUMENT_NO_MAX_LENGTH = 40;

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 그룹웨어 참조에도 사용하는 사용자 노출 문서번호. 최초 DRAFT는 null이며 취소 반환 DRAFT는 보존한다. */
    @Column(name = "document_no", length = DOCUMENT_NO_MAX_LENGTH)
    private String documentNo;

    /** 번호 채번과 정산 귀속에 사용하는 업무 기준일. */
    @Column(name = "settlement_date", nullable = false)
    private LocalDate settlementDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private SalesCommissionSettlementStatus status;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    /** 확정 취소 후 새 요율·금액 계산이 아직 필요한지 여부. 최초 DRAFT에서는 false다. */
    @Column(name = "recalculation_required", nullable = false)
    private boolean recalculationRequired;

    /** 이 정산서가 계산에 사용한 versioned 요율 계약. S1 미계산 draft에서는 null일 수 있다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "rate_contract_id")
    private SalesCommissionRateContract rateContract;

    @Column(name = "total_amount", precision = 24, scale = 6)
    private BigDecimal totalAmount;

    @Column(name = "equipment_amount", precision = 24, scale = 6)
    private BigDecimal equipmentAmount;

    @Column(name = "prepaid_amount", precision = 24, scale = 6)
    private BigDecimal prepaidAmount;

    @Column(name = "install_input_amount", precision = 24, scale = 6)
    private BigDecimal installInputAmount;

    @Column(name = "safety_input_amount", precision = 24, scale = 6)
    private BigDecimal safetyInputAmount;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method", length = 20)
    private SalesCommissionPaymentMethod paymentMethod;

    @Column(name = "withholding_applied")
    private Boolean withholdingApplied;

    @Column(name = "manual_expense_rate", precision = 19, scale = 8)
    private BigDecimal manualExpenseRate;

    @Column(name = "applied_expense_rate", precision = 19, scale = 8)
    private BigDecimal appliedExpenseRate;

    @Column(name = "card_amount", precision = 24, scale = 6)
    private BigDecimal cardAmount;

    @Column(name = "sales_amount", precision = 24, scale = 6)
    private BigDecimal salesAmount;

    @Column(name = "expense_amount", precision = 24, scale = 6)
    private BigDecimal expenseAmount;

    @Column(name = "withholding_amount", precision = 24, scale = 6)
    private BigDecimal withholdingAmount;

    @Column(name = "install_amount", precision = 24, scale = 6)
    private BigDecimal installAmount;

    @Column(name = "safety_amount", precision = 24, scale = 6)
    private BigDecimal safetyAmount;

    @Column(name = "subtotal_amount", precision = 24, scale = 6)
    private BigDecimal subtotalAmount;

    @Column(name = "payout_amount", precision = 24, scale = 6)
    private BigDecimal payoutAmount;

    @Column(name = "supply_amount", precision = 24, scale = 6)
    private BigDecimal supplyAmount;

    @Column(name = "vat_amount", precision = 24, scale = 6)
    private BigDecimal vatAmount;

    private SalesCommissionSettlement(LocalDate settlementDate) {
        if (settlementDate == null) {
            throw new IllegalArgumentException("settlementDate 는 필수입니다");
        }
        this.settlementDate = settlementDate;
        this.status = SalesCommissionSettlementStatus.DRAFT;
        this.version = 0L;
    }

    /** 번호 없는 최초 DRAFT 정산서를 만든다. */
    public static SalesCommissionSettlement createDraft(LocalDate settlementDate) {
        return new SalesCommissionSettlement(settlementDate);
    }

    /**
     * DRAFT 정산서를 확정하고 문서번호를 연결한다.
     *
     * @param documentNo 정산 기준일로 채번된 {@code yyyy/MM/dd-N} 문서번호
     * @return 체인 가능한 현재 정산서
     */
    public SalesCommissionSettlement confirm(String documentNo) {
        if (this.status != SalesCommissionSettlementStatus.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "DRAFT 상태에서만 영업수수료 정산서를 확정할 수 있습니다");
        }
        if (this.recalculationRequired) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "확정 취소 후 재확정하려면 최신 요율로 먼저 재계산해야 합니다");
        }
        if (documentNo == null || documentNo.isBlank() || documentNo.length() > DOCUMENT_NO_MAX_LENGTH) {
            throw new IllegalArgumentException("documentNo 는 1~40자 필수입니다");
        }
        String normalizedDocumentNo = documentNo.trim();
        if (this.documentNo != null && !this.documentNo.equals(normalizedDocumentNo)) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "확정 취소 후 재확정은 기존 문서번호를 유지해야 합니다");
        }
        this.documentNo = normalizedDocumentNo;
        this.status = SalesCommissionSettlementStatus.CONFIRMED;
        return this;
    }

    /** 확정 취소로 정산서를 DRAFT로 되돌리고 기존 문서번호를 보존한다. */
    public SalesCommissionSettlement cancelConfirmation() {
        if (this.status != SalesCommissionSettlementStatus.CONFIRMED) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "CONFIRMED 상태에서만 영업수수료 정산 확정을 취소할 수 있습니다");
        }
        clearCalculationSnapshot();
        this.recalculationRequired = true;
        this.status = SalesCommissionSettlementStatus.DRAFT;
        return this;
    }

    /** DRAFT에서만 정산 기준일을 변경한다. */
    public SalesCommissionSettlement changeSettlementDate(LocalDate settlementDate) {
        if (this.status != SalesCommissionSettlementStatus.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "DRAFT 상태에서만 영업수수료 정산 기준일을 변경할 수 있습니다");
        }
        if (settlementDate == null) {
            throw new IllegalArgumentException("settlementDate 는 필수입니다");
        }
        this.settlementDate = settlementDate;
        return this;
    }

    /** 확정 취소 후 새 계산이 필요한지 반환한다. */
    public boolean isRecalculationRequired() {
        return recalculationRequired;
    }

    /** 계약 버전과 계산 입력·결과를 정산서에 snapshot으로 기록한다. */
    public SalesCommissionSettlement recordCalculation(
            SalesCommissionRateContract rateContract,
            SalesCommissionSettlementCalculationInput input,
            SalesCommissionSettlementCalculationResult result) {
        if (this.status != SalesCommissionSettlementStatus.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT,
                    "DRAFT 상태에서만 영업수수료 정산을 재계산할 수 있습니다");
        }
        this.rateContract = Objects.requireNonNull(rateContract, "rateContract 는 필수입니다");
        Objects.requireNonNull(input, "input 은 필수입니다");
        Objects.requireNonNull(result, "result 는 필수입니다");

        this.totalAmount = input.total();
        this.equipmentAmount = input.equipment();
        this.prepaidAmount = input.prepaid();
        this.installInputAmount = input.install();
        this.safetyInputAmount = input.safety();
        this.paymentMethod = input.paymentMethod();
        this.withholdingApplied = input.withholdingApplied();
        this.manualExpenseRate = input.manualExpenseRate();
        this.appliedExpenseRate = result.expenseRate();
        this.cardAmount = result.card();
        this.salesAmount = result.sales();
        this.expenseAmount = result.expense();
        this.withholdingAmount = result.withholding();
        this.installAmount = result.install();
        this.safetyAmount = result.safety();
        this.subtotalAmount = result.subtotal();
        this.payoutAmount = result.payout();
        this.supplyAmount = result.supply();
        this.vatAmount = result.vat();
        this.recalculationRequired = false;
        return this;
    }

    private void clearCalculationSnapshot() {
        this.rateContract = null;
        this.totalAmount = null;
        this.equipmentAmount = null;
        this.prepaidAmount = null;
        this.installInputAmount = null;
        this.safetyInputAmount = null;
        this.paymentMethod = null;
        this.withholdingApplied = null;
        this.manualExpenseRate = null;
        this.appliedExpenseRate = null;
        this.cardAmount = null;
        this.salesAmount = null;
        this.expenseAmount = null;
        this.withholdingAmount = null;
        this.installAmount = null;
        this.safetyAmount = null;
        this.subtotalAmount = null;
        this.payoutAmount = null;
        this.supplyAmount = null;
        this.vatAmount = null;
    }
}
