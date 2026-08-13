package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.Product;
import com.samhanair.logis.product.domain.ProductGoodsType;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import java.util.UUID;

/**
 * by-code lookup endpoint 전용 경량 응답.
 *
 * <p>QA 도구 / 거래처 클라이언트가 modelCode (사용자 노출 식별자) 로
 * productId (UUID) 만 매핑 받아 inventory 등 후속 호출에 사용하는 것이 목적이다.
 * ProductResponse 상세 필드는 본 응답에 포함하지 않는다 (over-fetch 회피).
 *
 * @param id        제품 UUID — inventory-service 등 내부 호출용 (사용자 화면에는 노출 금지)
 * @param modelCode 사용자 노출 식별자 (시트 B열, V3 마이그)
 * @param name      제품명 (선택적 confirm 표시용)
 */
public record ProductByCodeResponse(@JsonSerialize(using = OpaqueUuidSerializer.class) UUID id, String modelCode, String name, ProductGoodsType goodsType) {

    public static ProductByCodeResponse from(Product product) {
        return new ProductByCodeResponse(
                product.getId(), product.getModelCode(), product.getName(), product.getGoodsType());
    }
}
