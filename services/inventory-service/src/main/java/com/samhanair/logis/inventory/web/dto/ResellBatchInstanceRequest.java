package com.samhanair.logis.inventory.web.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

/**
 * 검수 완료 회수품 재판매 요청 DTO.
 */
public record ResellBatchInstanceRequest(
        /** 회수 입고전표 번호 — 재판매 대상 특정 키 */
        @NotBlank(message = "recallSlipNo 는 필수이며 공백만으로 구성될 수 없습니다")
        String recallSlipNo,

        /** 품목코드 그룹 */
        @NotBlank(message = "productCode 는 필수이며 공백만으로 구성될 수 없습니다")
        String productCode,

        /** 재판매 목표 수량 */
        @Min(value = 1, message = "quantity 는 1 이상이어야 합니다")
        int quantity) {
}
