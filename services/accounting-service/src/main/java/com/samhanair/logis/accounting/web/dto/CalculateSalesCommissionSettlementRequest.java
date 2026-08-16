package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.SalesCommissionPaymentMethod;
import com.samhanair.logis.accounting.domain.SalesCommissionSettlementCalculationInput;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;

/** 레거시 R-18 식으로 DRAFT 정산서를 계산하고 snapshot을 저장하는 요청. */
public record CalculateSalesCommissionSettlementRequest(
        @NotNull @Pattern(regexp = "^-?\\d{1,18}(\\.\\d{1,6})?$|^$") String total,
        @NotNull @Pattern(regexp = "^-?\\d{1,18}(\\.\\d{1,6})?$|^$") String equipment,
        @NotNull @Pattern(regexp = "^-?\\d{1,18}(\\.\\d{1,6})?$|^$") String prepaid,
        @NotNull @Pattern(regexp = "^-?\\d{1,18}(\\.\\d{1,6})?$|^$") String install,
        @NotNull @Pattern(regexp = "^-?\\d{1,18}(\\.\\d{1,6})?$|^$") String safety,
        @NotNull SalesCommissionPaymentMethod paymentMethod,
        @NotNull Boolean withholdingApplied,
        @Pattern(regexp = "^-?\\d{1,18}(\\.\\d{1,6})?$|^$") String manualExpenseRate,
        @NotNull Integer rateContractVersion) {

    public SalesCommissionSettlementCalculationInput toInput() {
        return new SalesCommissionSettlementCalculationInput(
                parse(total), parse(equipment), parse(prepaid), parse(install), parse(safety), paymentMethod,
                withholdingApplied, parseOptional(manualExpenseRate));
    }

    private static BigDecimal parse(String value) {
        return value == null || value.isBlank() ? BigDecimal.ZERO : new BigDecimal(value);
    }

    private static BigDecimal parseOptional(String value) {
        return value == null ? null : parse(value);
    }
}
