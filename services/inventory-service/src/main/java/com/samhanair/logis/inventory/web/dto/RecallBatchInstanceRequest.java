package com.samhanair.logis.inventory.web.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

/**
 * S4 INBOUND 반품/회차 전표 complete 연동용 인스턴스 회수 요청 DTO.
 */
public record RecallBatchInstanceRequest(
        /** 출고 거래처 코드 — 회수 대상 특정 키 */
        @NotBlank(message = "partnerCode 는 필수이며 공백만으로 구성될 수 없습니다")
        String partnerCode,

        /** 품목코드 그룹 */
        @NotBlank(message = "productCode 는 필수이며 공백만으로 구성될 수 없습니다")
        String productCode,

        /** 회수 목표 수량 */
        @Min(value = 1, message = "quantity 는 1 이상이어야 합니다")
        int quantity,

        /** 회수 입고전표 번호 — 멱등 키 */
        @NotBlank(message = "recallSlipNo 는 필수이며 공백만으로 구성될 수 없습니다")
        String recallSlipNo) {
}
