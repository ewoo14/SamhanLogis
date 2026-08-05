package com.samhanair.logis.slip.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** 평면 전표 라인에 BUNDLE 부모가 들어가는 것을 저장 전에 차단하는 공통 검증 경계. */
public final class BundleProductGuard {

    private BundleProductGuard() {
    }

    /**
     * 요청 productId를 product-service 정본과 대조해 EXPAND BUNDLE 부모만 거부한다.
     * KEEP은 부모 1행 유지가 도메인 계약이므로 평면 저장을 허용한다.
     *
     * @param productClient product-service 조회 경계
     * @param productIds 평면 라인으로 저장하려는 제품 ID
     */
    public static void rejectParents(ProductClient productClient, List<UUID> productIds) {
        rejectParents(productClient.lookup(productIds.stream().distinct().toList()));
    }

    /** 이미 조회한 정본을 재사용하는 저장 입구용 판정. */
    public static void rejectParents(List<ProductSummary> summaries) {
        if (summaries != null && summaries.stream()
                .filter(Objects::nonNull)
                .anyMatch(BundleModePolicy::shouldExpand)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "세트 품목은 구성품으로 전개한 뒤 저장해야 합니다.");
        }
    }
}
