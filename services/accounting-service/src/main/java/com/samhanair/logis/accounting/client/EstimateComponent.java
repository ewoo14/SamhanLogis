package com.samhanair.logis.accounting.client;

import java.math.BigDecimal;

/** product-service estimate catalog의 세트 구성품 wire DTO. */
public record EstimateComponent(
        String setModelCode,
        String componentModelCode,
        BigDecimal deliveryPrice,
        BigDecimal releasePrice,
        String kind) {

    public BigDecimal matchingPrice() {
        return releasePrice != null ? releasePrice : deliveryPrice;
    }
}
