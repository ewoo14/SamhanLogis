package com.samhanair.logis.product.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 회계 라벨 단건 조회 요청 — accounting-service #773 일마감 재검증이 사용.
 *
 * @param label 품목명[규격] 형태의 회계 라인 라벨. 공백 제외 1~200자.
 */
public record LookupByLabelRequest(
        @NotBlank(message = "label은 필수입니다")
        @Size(max = 200, message = "label은 최대 200자입니다")
        String label) {
}
