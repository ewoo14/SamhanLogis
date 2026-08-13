package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/**
 * S3 OUTBOUND 전표 accept 연동용 인스턴스 FIFO 예약 요청 DTO.
 *
 * <p>serial-managed 품목만 허용되며, 서비스 레이어가 product-service 의 {@code serialManaged}
 * 플래그를 확인해 batch 품목이면 409 CONFLICT 를 반환한다.
 */
public record ReserveBatchInstanceRequest(
        /** 품목코드 그룹 — 필수, FIFO 인덱스 키 */
        @NotBlank(message = "productCode 는 필수이며 공백만으로 구성될 수 없습니다")
        String productCode,

        /** 출고 원천 창고 UUID — 필수 */
        @JsonDeserialize(using = OpaqueUuidDeserializer.class)
        @NotNull(message = "warehouseId 는 필수입니다")
        UUID warehouseId,

        /** 예약 목표 수량 — 1 이상 */
        @Min(value = 1, message = "quantity 는 1 이상이어야 합니다")
        int quantity,

        /** 출고전표 번호 — 멱등 기준 */
        @NotBlank(message = "outboundSlipNo 는 필수이며 공백만으로 구성될 수 없습니다")
        String outboundSlipNo) {
}
