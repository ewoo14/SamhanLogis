package com.samhanair.logis.partnerorder.client;

/** product-service가 주문 확정용으로 반환하는 UUID-free 분류 snapshot. */
public record ProductClassification(String modelCode, String productCategory,
                                    String classificationL, String classificationM,
                                    boolean classificationAssigned) {
    public ProductClassification(String modelCode, String productCategory,
                                 String classificationL, String classificationM) {
        this(modelCode, productCategory, classificationL, classificationM,
                classificationL != null || classificationM != null);
    }
}
