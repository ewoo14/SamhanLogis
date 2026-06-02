package com.samhanair.logis.inventory.web.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * S4 INBOUND 반품/회차 전표 complete 보상용 인스턴스 회수 취소 요청 DTO.
 */
public record UnrecallBatchInstanceRequest(
        /** 회수 입고전표 번호 — 보상 대상 특정 키 */
        @NotBlank(message = "recallSlipNo 는 필수이며 공백만으로 구성될 수 없습니다")
        String recallSlipNo,

        /** 품목코드 그룹 */
        @NotBlank(message = "productCode 는 필수이며 공백만으로 구성될 수 없습니다")
        String productCode) {
}
