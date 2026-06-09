package com.samhanair.logis.slip.client;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * product-service {@code /products/internal/expand} 응답 라인 — 세트→구성품 전개 결과.
 * slip-service 가 EstimateLine/SlipLine 으로 영속한다. product-service ExpandedLineResponse 와 wire-format 일치.
 */
public record ExpandedLineDto(
        UUID productId,
        String modelCode,
        String modelName,
        String name,
        BigDecimal quantity,
        BigDecimal unitPrice,
        String componentKind,
        boolean setHead) {

    /** 세트 전개 옵션 — product-service ExpandRequest.Options 와 일치. */
    public record Options(String remoteOption, boolean remoteExcluded, String panelOption,
                          String panelShape360, boolean materialIncluded) {
    }
}
