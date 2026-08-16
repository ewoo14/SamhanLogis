package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.SalesCommissionSettlement;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** 영업수수료 정산서 API 응답. id는 후속 mutation path용이며 화면에는 표시하지 않는다. */
public record SalesCommissionSettlementResponse(
        UUID id,
        String documentNo,
        LocalDate settlementDate,
        SalesCommissionSettlementStatus status,
        BigDecimal totalAmount,
        BigDecimal payoutAmount,
        BigDecimal supplyAmount,
        BigDecimal vatAmount,
        Integer rateContractVersion,
        BigDecimal equipmentAmount,
        BigDecimal prepaidAmount,
        BigDecimal installInputAmount,
        BigDecimal safetyInputAmount,
        String paymentMethod,
        Boolean withholdingApplied,
        BigDecimal manualExpenseRate,
        BigDecimal appliedExpenseRate,
        BigDecimal cardAmount,
        BigDecimal salesAmount,
        BigDecimal expenseAmount,
        BigDecimal withholdingAmount,
        BigDecimal installAmount,
        BigDecimal safetyAmount,
        BigDecimal subtotalAmount) {

    /** aggregate snapshot을 API 응답으로 변환한다. */
    public static SalesCommissionSettlementResponse from(SalesCommissionSettlement settlement) {
        return new SalesCommissionSettlementResponse(
                settlement.getId(),
                settlement.getDocumentNo(),
                settlement.getSettlementDate(),
                settlement.getStatus(),
                settlement.getTotalAmount(),
                settlement.getPayoutAmount(),
                settlement.getSupplyAmount(),
                settlement.getVatAmount(),
                settlement.getRateContract() == null ? null : settlement.getRateContract().getVersionNo(),
                settlement.getEquipmentAmount(), settlement.getPrepaidAmount(),
                settlement.getInstallInputAmount(), settlement.getSafetyInputAmount(),
                settlement.getPaymentMethod() == null ? null : settlement.getPaymentMethod().name(),
                settlement.getWithholdingApplied(), settlement.getManualExpenseRate(),
                settlement.getAppliedExpenseRate(), settlement.getCardAmount(), settlement.getSalesAmount(),
                settlement.getExpenseAmount(), settlement.getWithholdingAmount(), settlement.getInstallAmount(),
                settlement.getSafetyAmount(), settlement.getSubtotalAmount());
    }
}
