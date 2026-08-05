package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** 평면 전표 라인에 BUNDLE 부모가 들어가는 것을 저장 전에 차단하는 공통 검증 경계. */
final class BundleProductGuard {

    private BundleProductGuard() {
    }

    /**
     * 요청 productId를 product-service 정본과 대조해 BUNDLE 부모를 거부한다.
     *
     * @param productClient product-service 조회 경계
     * @param productIds 평면 라인으로 저장하려는 제품 ID
     */
    static void rejectParents(ProductClient productClient, List<UUID> productIds) {
        List<ProductSummary> summaries = productClient.lookup(productIds.stream().distinct().toList());
        if (summaries != null && summaries.stream()
                .filter(Objects::nonNull)
                .anyMatch(summary -> "BUNDLE".equals(summary.productType()))) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "세트 품목은 전표 라인으로 저장할 수 없습니다. 구성품으로 전개해 주세요.");
        }
    }
}
