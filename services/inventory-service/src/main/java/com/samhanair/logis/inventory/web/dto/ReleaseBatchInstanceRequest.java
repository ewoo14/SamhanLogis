package com.samhanair.logis.inventory.web.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * S3 OUTBOUND 전표 reject/cancel 연동용 인스턴스 예약 해제 요청 DTO.
 */
public record ReleaseBatchInstanceRequest(
        /** 출고전표 번호 — 예약 인스턴스 특정 키 */
        @NotBlank(message = "outboundSlipNo 는 필수이며 공백만으로 구성될 수 없습니다")
        String outboundSlipNo,

        /** 품목코드 그룹 */
        @NotBlank(message = "productCode 는 필수이며 공백만으로 구성될 수 없습니다")
        String productCode) {
}
