package com.samhanair.logis.product.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 품목 표시 순서 일괄 갱신 요청 항목 (§1d 2026-06-11).
 *
 * <p>PUT /api/v1/products/display-orders 의 배열 요소.
 * 전건 검증 후 일괄 적용 (부분 적용 금지, 트랜잭션 단일).
 *
 * @param modelCode    카탈로그 노출 식별자 (model_code ?? model_name fallback)
 * @param displayOrder 새 표시 순서 (필수 — {@code @NotNull}, null 시 400; 순서 해제는 미지원)
 */
public record DisplayOrderRequest(
        @NotBlank String modelCode,
        @NotNull Integer displayOrder
) {
}
