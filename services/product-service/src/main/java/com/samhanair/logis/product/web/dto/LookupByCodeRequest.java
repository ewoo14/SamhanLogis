package com.samhanair.logis.product.web.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * 품목코드(product_code) 기준 internal 단건 조회 요청.
 *
 * @param productCode 이카운트 품목코드 그룹
 */
public record LookupByCodeRequest(
        @NotBlank(message = "productCode 는 필수입니다")
        String productCode) {
}
