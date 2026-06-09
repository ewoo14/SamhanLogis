package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.domain.SlipLine;
import java.math.BigDecimal;
import java.util.UUID;

/**
 * 라인 응답 — id, product 정보, 규격, 수량, 단가, lineTotal, note.
 * Slice A (sales-polish-2): {@code specification} 필드 신규 응답 (사용자 피드백 #4).
 */
public record SlipLineResponse(
        UUID id,
        UUID productId,
        String productName,
        String modelName,
        String specification,
        int quantity,
        BigDecimal unitPrice,
        BigDecimal lineTotal,
        String note,
        /** VAT 포함 단가 — 단가 부가세포함 전환(2026-06-09). 화면 '단가' 표시값. nullable(legacy). */
        BigDecimal unitPriceWithVat,
        /** 공급가액(라인 단위, VAT 미포함). nullable(legacy). */
        BigDecimal supplyAmount,
        /** 부가세(라인 단위). nullable(legacy). */
        BigDecimal vatAmount) {

    public static SlipLineResponse from(SlipLine line) {
        return new SlipLineResponse(
                line.getId(),
                line.getProductId(),
                line.getProductName(),
                line.getModelName(),
                line.getSpecification(),
                line.getQuantity(),
                line.getUnitPrice(),
                line.getLineTotal(),
                line.getNote(),
                line.getUnitPriceWithVat(),
                line.getSupplyAmount(),
                line.getVatAmount());
    }
}
