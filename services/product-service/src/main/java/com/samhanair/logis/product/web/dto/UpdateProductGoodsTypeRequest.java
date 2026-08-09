package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.ProductGoodsType;
import jakarta.validation.constraints.NotNull;

/** 견적품목 메뉴에서 상품/비상품 선언을 변경하는 요청. */
public record UpdateProductGoodsTypeRequest(
        @NotNull(message = "goodsType 은 필수입니다") ProductGoodsType goodsType) {
}
