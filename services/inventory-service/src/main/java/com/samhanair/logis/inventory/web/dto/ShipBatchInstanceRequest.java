package com.samhanair.logis.inventory.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;

/**
 * S3 OUTBOUND 전표 complete 연동용 인스턴스 출고 요청 DTO.
 */
public record ShipBatchInstanceRequest(
        /** 출고전표 번호 — 예약 인스턴스 특정 키 */
        @NotBlank(message = "outboundSlipNo 는 필수이며 공백만으로 구성될 수 없습니다")
        String outboundSlipNo,

        /** 품목코드 그룹 */
        @NotBlank(message = "productCode 는 필수이며 공백만으로 구성될 수 없습니다")
        String productCode,

        /** 출고 거래처 코드 */
        String partnerCode,

        /** 출고일시 — null 이면 도메인에서 서버 기준 now() 사용 */
        LocalDateTime outboundAt,

        /** source journal 연결 정보(기존 호출은 생략 가능) */
        @NotNull(message = "sourceContext 는 필수입니다") SourceOperationContext sourceContext) {
}
