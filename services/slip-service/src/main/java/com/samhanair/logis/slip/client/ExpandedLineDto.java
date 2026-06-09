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
        boolean setHead,
        /** 구성품 규격(product_spec 합성, #24). 없으면 null. */
        String specification) {

    /** 호환 생성자 — specification 미제공(기존 8-arg 호출자/테스트). */
    public ExpandedLineDto(UUID productId, String modelCode, String modelName, String name,
                           BigDecimal quantity, BigDecimal unitPrice, String componentKind, boolean setHead) {
        this(productId, modelCode, modelName, name, quantity, unitPrice, componentKind, setHead, null);
    }

    /** 세트 전개 옵션 — product-service ExpandRequest.Options 와 일치. */
    public record Options(String remoteOption, boolean remoteExcluded, String panelOption,
                          String panelShape360, boolean materialIncluded) {
    }
}
