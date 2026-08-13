package com.samhanair.logis.product.web.dto;

import java.math.BigDecimal;

/** API에 노출되는 Product 식별 정보. 내부 UUID는 포함하지 않는다. */
public record QuantitySyncProductRef(String productCode, String productName,
                                     BigDecimal factor, BigDecimal multiplier,
                                     String roundingMode, String componentVariant,
                                     String componentShape, Integer displayOrder) {

    /** source 표현을 만든다. */
    public static QuantitySyncProductRef source(String productCode, String productName,
                                                BigDecimal factor) {
        return new QuantitySyncProductRef(productCode, productName, factor, null, null, null, null, null);
    }

    /** target 표현을 만든다. */
    public static QuantitySyncProductRef target(String productCode, String productName,
                                                BigDecimal multiplier, String roundingMode,
                                                String componentVariant, String componentShape,
                                                Integer displayOrder) {
        return new QuantitySyncProductRef(productCode, productName, null, multiplier,
                roundingMode, componentVariant, componentShape, displayOrder);
    }
}
