package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.SalesCommissionSettlement;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementStatus;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** 영업수수료 정산서 API 응답. id는 후속 mutation path용이며 화면에는 표시하지 않는다. */
public record SalesCommissionSettlementResponse(
        UUID id,
        String documentNo,
        LocalDate settlementDate,
        SalesCommissionSettlementStatus status,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal totalAmount,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal payoutAmount,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal supplyAmount,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal vatAmount,
        Integer rateContractVersion,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal equipmentAmount,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal prepaidAmount,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal installInputAmount,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal safetyInputAmount,
        String paymentMethod,
        Boolean withholdingApplied,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal manualExpenseRate,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal appliedExpenseRate,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal cardAmount,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal salesAmount,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal expenseAmount,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal withholdingAmount,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal installAmount,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal safetyAmount,
        @JsonSerialize(using = ToStringSerializer.class) BigDecimal subtotalAmount) {

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
