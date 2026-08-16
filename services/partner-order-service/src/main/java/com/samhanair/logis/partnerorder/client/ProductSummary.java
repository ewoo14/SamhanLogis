package com.samhanair.logis.partnerorder.client;

import java.math.BigDecimal;
import java.util.UUID;

/** product-service 가 반환하는 제품 요약 wire-format 사본. */
public record ProductSummary(
        UUID id, String name, String modelName, UUID categoryId, BigDecimal sellingPrice, String status,
        String modelCode, String productType, String categoryKey, BigDecimal fixedDiscountRate,
        String fixedDiscountSource, String discountFlags, BigDecimal releasePrice, BigDecimal deliveryPrice,
        Boolean hasVariableDiscount, String physicalCategoryCode, String discountOption,
        boolean classificationAssigned) {
    public ProductSummary(UUID id, String name, String modelName, UUID categoryId,
                          BigDecimal sellingPrice, String status) {
        this(id, name, modelName, categoryId, sellingPrice, status, null, null, null, null,
                null, null, null, null, null, null, null, false);
    }
    public ProductSummary(UUID id, String name, String modelName, UUID categoryId,
                          BigDecimal sellingPrice, String status, String productType) {
        this(id, name, modelName, categoryId, sellingPrice, status, null, productType, null, null,
                null, null, null, null, null, null, null, false);
    }
    public ProductSummary(UUID id, String name, String modelName, UUID categoryId,
                          BigDecimal sellingPrice, String status, String modelCode, String productType) {
        this(id, name, modelName, categoryId, sellingPrice, status, modelCode, productType, null, null,
                null, null, null, null, null, null, null, false);
    }
    public ProductSummary(UUID id, String name, String modelName, UUID categoryId,
                          BigDecimal sellingPrice, String status, String modelCode, String productType,
                          String categoryKey) {
        this(id, name, modelName, categoryId, sellingPrice, status, modelCode, productType, categoryKey,
                null, null, null, null, null, null, null, null, false);
    }
    public ProductSummary(UUID id, String name, String modelName, UUID categoryId,
                          BigDecimal sellingPrice, String status, String modelCode, String productType,
                          String categoryKey, BigDecimal fixedDiscountRate, String discountFlags) {
        this(id, name, modelName, categoryId, sellingPrice, status, modelCode, productType, categoryKey,
                fixedDiscountRate, null, discountFlags, null, null, null, null, null, false);
    }
    public ProductSummary(UUID id, String name, String modelName, UUID categoryId,
                          BigDecimal sellingPrice, String status, String modelCode, String productType,
                          String categoryKey, BigDecimal fixedDiscountRate, String discountFlags,
                          BigDecimal releasePrice, BigDecimal deliveryPrice, Boolean hasVariableDiscount) {
        this(id, name, modelName, categoryId, sellingPrice, status, modelCode, productType, categoryKey,
                fixedDiscountRate, null, discountFlags, releasePrice, deliveryPrice, hasVariableDiscount,
                null, null, false);
    }
    public ProductSummary(UUID id, String name, String modelName, UUID categoryId,
                          BigDecimal sellingPrice, String status, String modelCode, String productType,
                          String categoryKey, BigDecimal fixedDiscountRate, String discountFlags,
                          BigDecimal releasePrice, BigDecimal deliveryPrice, Boolean hasVariableDiscount,
                          String physicalCategoryCode) {
        this(id, name, modelName, categoryId, sellingPrice, status, modelCode, productType, categoryKey,
                fixedDiscountRate, null, discountFlags, releasePrice, deliveryPrice, hasVariableDiscount,
                physicalCategoryCode, null, false);
    }
    public ProductSummary(UUID id, String name, String modelName, UUID categoryId,
                          BigDecimal sellingPrice, String status, String modelCode, String productType,
                          String categoryKey, BigDecimal fixedDiscountRate, String fixedDiscountSource,
                          String discountFlags, BigDecimal releasePrice, BigDecimal deliveryPrice,
                          Boolean hasVariableDiscount, String physicalCategoryCode) {
        this(id, name, modelName, categoryId, sellingPrice, status, modelCode, productType, categoryKey,
                fixedDiscountRate, fixedDiscountSource, discountFlags, releasePrice, deliveryPrice,
                hasVariableDiscount, physicalCategoryCode, null, false);
    }
}
