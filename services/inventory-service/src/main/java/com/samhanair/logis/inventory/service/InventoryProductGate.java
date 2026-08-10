package com.samhanair.logis.inventory.service;

import com.samhanair.logis.inventory.client.ProductSummary;

/** 재고 변이 대상 품목의 공통 판정. */
final class InventoryProductGate {

    private InventoryProductGate() {
    }

    static boolean isExcluded(ProductSummary product) {
        return !product.goods() || "BUNDLE".equals(product.productType());
    }
}
