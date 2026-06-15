package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.BundleComponent;
import com.samhanair.logis.product.domain.BundleMode;
import com.samhanair.logis.product.domain.ProductCategory;
import com.samhanair.logis.product.domain.ProductGoodsType;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** 제품 신규 등록 요청. {@code currency} 가 null 이면 'KRW' 로 default. */
public record CreateProductRequest(
        @NotBlank @Size(max = 150) String name,
        @NotBlank @Size(max = 100) String modelName,
        @NotNull UUID categoryId,
        @NotNull @DecimalMin("0.00") BigDecimal sellingPrice,
        @NotNull @DecimalMin("0.00") BigDecimal purchasePrice,
        @Size(min = 3, max = 3) String currency,
        Map<String, String> tags,
        @Size(max = 1000) String description,
        ProductItemKind itemKind,
        ProductCategory productCategory,
        BundleMode bundleMode,
        @Size(max = 100) String parentSetModelCode,
        BundleComponent.ComponentKind componentKind,
        @Size(max = 20) String unit,
        @DecimalMin("0.00") BigDecimal releasePrice,
        @DecimalMin("0.00") BigDecimal deliveryPrice,
        ProductGoodsType goodsType,
        @Valid List<ProductSpecRequest> specs) {

    public CreateProductRequest(String name, String modelName, UUID categoryId,
                                BigDecimal sellingPrice, BigDecimal purchasePrice,
                                String currency, Map<String, String> tags, String description) {
        this(name, modelName, categoryId, sellingPrice, purchasePrice, currency,
                tags, description, null, null, null, null, null, null, null, null, null, null);
    }
}
