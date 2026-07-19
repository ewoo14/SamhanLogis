package com.samhanair.logis.accounting.web.dto;

import com.samhanair.logis.accounting.domain.PlanBasis;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

/** 수금계획 등록 요청. partnerId UUID 는 받지 않는다. */
public record CreateCollectionPlanRequest(
        @Size(max = 100) String partnerCode,
        @Size(max = 20) String bizNo,
        @Size(max = 100) String partnerName,
        @NotNull LocalDate plannedDate,
        @NotNull @DecimalMin(value = "0.01") BigDecimal plannedAmount,
        @NotNull PlanBasis basis,
        @Size(max = 100) String sourceReference,
        @Size(max = 1000) String memo
) {
}
