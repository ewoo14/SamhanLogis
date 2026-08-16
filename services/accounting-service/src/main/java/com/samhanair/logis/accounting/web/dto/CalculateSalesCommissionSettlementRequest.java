package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.SalesCommissionPaymentMethod;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementCalculationInput;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

/** 레거시 R-18 식으로 DRAFT 정산서를 계산하고 snapshot을 저장하는 요청. */
public record CalculateSalesCommissionSettlementRequest(
        @NotNull BigDecimal total,
        @NotNull BigDecimal equipment,
        @NotNull BigDecimal prepaid,
        @NotNull BigDecimal install,
        @NotNull BigDecimal safety,
        @NotNull SalesCommissionPaymentMethod paymentMethod,
        @NotNull Boolean withholdingApplied,
        BigDecimal manualExpenseRate,
        @NotNull Integer rateContractVersion) {

    public SalesCommissionSettlementCalculationInput toInput() {
        return new SalesCommissionSettlementCalculationInput(
                total, equipment, prepaid, install, safety, paymentMethod,
                withholdingApplied, manualExpenseRate);
    }
}
