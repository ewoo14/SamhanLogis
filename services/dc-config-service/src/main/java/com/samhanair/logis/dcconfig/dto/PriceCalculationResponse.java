package com.samhanair.logis.dcconfig.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.util.List;

/**
 * 가격 계산 응답 — internal 전용. 라인별 적용 단가 + 합계.
 */
@Schema(description = "DC 적용 가격 계산 응답")
public record PriceCalculationResponse(
        @Schema(description = "거래처 코드") String partnerCode,
        @Schema(description = "라인별 결과") List<Line> lines,
        @Schema(description = "정상가 합계") BigDecimal totalListAmount,
        @Schema(description = "DC 적용 후 합계") BigDecimal totalFinalAmount,
        @Schema(description = "차감 합계") BigDecimal totalDiscountAmount
) {

    @Schema(description = "라인별 가격 계산 결과")
    public record Line(
            @Schema(description = "라인 식별자") String lineId,
            @Schema(description = "정상 단가") BigDecimal listPrice,
            @Schema(description = "DC 적용 단가") BigDecimal finalPrice,
            @Schema(description = "라인 합계 (finalPrice * quantity)") BigDecimal finalAmount,
            @Schema(description = "수량") Integer quantity,
            @Schema(description = "적용된 DC율 (있으면)") BigDecimal appliedRate,
            @Schema(description = "적용된 정액 DC 합계") BigDecimal appliedFixedAmount
    ) {}
}
