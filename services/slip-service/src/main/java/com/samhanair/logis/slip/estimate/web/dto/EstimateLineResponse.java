package com.samhanair.logis.slip.estimate.web.dto;

import com.samhanair.logis.slip.estimate.domain.EstimateLine;
import java.math.BigDecimal;
import java.util.UUID;

/** 견적 라인 응답. */
public record EstimateLineResponse(
        UUID id,
        int lineNo,
        UUID productId,
        String productName,
        String modelName,
        String specification,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal supplyAmount,
        BigDecimal vatAmount,
        BigDecimal lineTotal,
        String note,
        /** VAT 포함 단가 — 단가 부가세포함 전환(2026-06-09). 화면 '단가' 표시값. nullable(legacy). */
        BigDecimal unitPriceWithVat) {

    public static EstimateLineResponse from(EstimateLine line) {
        return new EstimateLineResponse(
                line.getId(),
                line.getLineNo(),
                line.getProductId(),
                line.getProductName(),
                line.getModelName(),
                line.getSpecification(),
                line.getQuantity(),
                line.getUnitPrice(),
                line.getSupplyAmount(),
                line.getVatAmount(),
                line.getLineTotal(),
                line.getNote(),
                line.getUnitPriceWithVat());
    }
}
