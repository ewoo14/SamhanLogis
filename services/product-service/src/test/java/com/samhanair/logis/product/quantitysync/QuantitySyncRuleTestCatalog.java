package com.samhanair.logis.product.quantitysync;

import com.samhanair.logis.product.domain.Classification;
import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.service.ClassificationService;
import com.samhanair.logis.product.service.ProductService;
import com.samhanair.logis.product.web.dto.ClassificationResponse;
import com.samhanair.logis.product.web.dto.CreateClassificationRequest;
import com.samhanair.logis.product.web.dto.UpdateProductClassificationRequest;
import java.util.UUID;

/** 수량 동기화 통합 fixture가 새 target 역할 계약을 서비스 경로로 구성하도록 돕는다. */
public final class QuantitySyncRuleTestCatalog {

    private QuantitySyncRuleTestCatalog() {
    }

    /** HOME_MULTI의 허용 target 역할인 부자재 L분류를 조회하거나 관리자 서비스로 만든다. */
    public static UUID ensureMaterialClassification(ClassificationService classificationService) {
        return ensureMaterialClassification(classificationService, EstimateCategory.HOME_MULTI);
    }

    /** 지정한 견적 카테고리의 허용 target 역할인 부자재 L분류를 조회하거나 만든다. */
    public static UUID ensureMaterialClassification(ClassificationService classificationService,
                                                     EstimateCategory estimateCategory) {
        return classificationService.list(estimateCategory, null).stream()
                .filter(row -> row.catLevel() == Classification.CatLevel.L)
                .filter(row -> "부자재".equals(row.name()))
                .map(ClassificationResponse::id)
                .findFirst()
                .orElseGet(() -> classificationService.create(new CreateClassificationRequest(
                        estimateCategory, Classification.CatLevel.L, null,
                        "부자재", null, true)).id());
    }

    /** 실제 품목 분류 PATCH와 동일한 ProductService 경로로 target 역할을 지정한다. */
    public static void classifyAsMaterial(ProductService productService, String modelCode, UUID catLId) {
        productService.updateClassificationAndFixedDiscount(modelCode,
                new UpdateProductClassificationRequest(catLId, null, null));
    }
}
