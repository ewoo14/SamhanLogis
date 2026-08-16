package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.Product;

/** 주문 확정용 품목분류 snapshot. UUID와 품명은 포함하지 않는다. */
public record ProductClassificationLookupResponse(
        String modelCode, String productCategory, String classificationL, String classificationM,
        boolean classificationAssigned) {
    public static ProductClassificationLookupResponse from(Product product) {
        return new ProductClassificationLookupResponse(
                product.getModelCode() == null || product.getModelCode().isBlank()
                        ? product.getModelName() : product.getModelCode(),
                product.getProductCategory() == null ? null : product.getProductCategory().name(),
                product.getCatL() == null ? null : product.getCatL().getName(),
                product.getCatM() == null ? null : product.getCatM().getName(),
                product.getCatL() != null || product.getCatM() != null || product.getCatS() != null);
    }
}
