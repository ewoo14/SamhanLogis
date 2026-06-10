package com.samhanair.logis.product.web.dto;

import com.samhanair.logis.product.domain.EstimateCategory;
import com.samhanair.logis.product.domain.UsageScope;
import jakarta.validation.constraints.NotNull;

/**
 * 품목 노출 범위 수동 override 요청 DTO.
 *
 * <p>{@code PATCH /api/v1/products/{modelCode}/usage} 엔드포인트 body.
 * {@code usageScope} 는 필수. {@code estimateCategory} 는 scope 가
 * {@link UsageScope#ESTIMATE} 또는 {@link UsageScope#BOTH} 일 때만 의미가 있다.
 * NONE/PARTNER_ORDER 로 설정 시 서비스가 {@code estimateCategory} 를 자동 null 처리한다.
 */
public record UpdateProductUsageRequest(
        @NotNull(message = "usageScope 는 필수입니다")
        UsageScope usageScope,
        EstimateCategory estimateCategory) {
}
