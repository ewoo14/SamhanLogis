package com.samhanair.logis.partnerorder.web.dto;

import com.samhanair.logis.partnerorder.service.PartnerOrderPriceCalculationService;
import java.math.BigDecimal;
import java.util.List;

/** 사용자용 가격 미리보기 응답 — 서버가 실제 적용한 최종 단가/할인율을 반환한다. */
public record PricePreviewResponse(List<Line> lines,
                                   BigDecimal totalListAmount,
                                   BigDecimal totalFinalAmount,
                                   BigDecimal totalDiscountAmount) {

    public record Line(String lineId, String modelCode, int quantity,
                       BigDecimal listPrice, BigDecimal finalPrice, BigDecimal appliedRate) {}

    public static PricePreviewResponse from(PartnerOrderPriceCalculationService.Calculation calculation) {
        List<Line> lines = calculation.lines().stream()
                .map(line -> new Line(
                        String.valueOf(line.index()),
                        line.product().modelCode() != null
                                ? line.product().modelCode() : line.product().modelName(),
                        line.request().quantity(), line.listPrice(), line.finalPrice(),
                        line.appliedRate()))
                .toList();
        return new PricePreviewResponse(lines, calculation.totalListAmount(),
                calculation.totalFinalAmount(),
                calculation.totalListAmount().subtract(calculation.totalFinalAmount()));
    }
}
