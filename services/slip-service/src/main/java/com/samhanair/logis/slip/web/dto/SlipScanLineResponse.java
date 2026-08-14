package com.samhanair.logis.slip.web.dto;

import com.samhanair.logis.slip.client.ProductSummary;
import java.util.UUID;

/** QR 출고 검증에 필요한 품목코드·수량·시리얼 관리 여부만 반환한다. */
public record SlipScanLineResponse(String productCode, int quantity, boolean serialManaged) {

    static SlipScanLineResponse from(UUID productId, int quantity, ProductSummary product) {
        String productCode = product == null ? null : product.productCode();
        return new SlipScanLineResponse(productCode, quantity, product != null && product.serialManaged());
    }
}
