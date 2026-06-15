package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductGoodsType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.UUID;

/** 제품 부분 수정 — null 필드는 미변경. 가격/태그/단종은 별도 endpoint. */
public record UpdateProductRequest(
        @Size(max = 150) String name,
        @Size(max = 100) String modelName,
        UUID categoryId,
        @Size(max = 1000) String description,
        ProductItemKind itemKind,
        ProductCategory productCategory,
        BundleMode bundleMode,
        @Size(max = 100) String parentSetModelCode,
        BundleComponent.ComponentKind componentKind,
        @Size(max = 20) String unit,
        @DecimalMin("0.00") BigDecimal releasePrice,
        @DecimalMin("0.00") BigDecimal deliveryPrice,
        ProductGoodsType goodsType) {

    public UpdateProductRequest(String name, String modelName, UUID categoryId, String description) {
        this(name, modelName, categoryId, description, null, null, null, null, null,
                null, null, null, null);
    }
}
