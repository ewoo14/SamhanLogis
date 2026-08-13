package com.samhanair.logis.accounting.web.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

/** 영업수수료 정산서 DRAFT 생성 요청. */
public record CreateSalesCommissionSettlementRequest(
        @NotNull(message = "settlementDate 는 필수입니다")
        LocalDate settlementDate) {
}
