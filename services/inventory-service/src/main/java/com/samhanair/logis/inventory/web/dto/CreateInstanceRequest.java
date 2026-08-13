package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 개별시리얼 인스턴스 수동 생성 요청 DTO (Phase INV-S S1).
 *
 * <p>serial_managed=true 인 품목만 허용 — 아닌 경우 서비스 레이어에서 409 반환.
 */
public record CreateInstanceRequest(
        /** 제품 UUID (product-service 논리 참조) — 필수 */
        @NotNull(message = "productId 는 필수입니다")
        UUID productId,

        /** 품목코드 그룹 — 필수, FIFO 인덱스 키 (빈 문자열/공백 불허) */
        @NotBlank(message = "productCode 는 필수이며 공백만으로 구성될 수 없습니다")
        String productCode,

        /** 입고 창고 UUID — 필수 */
        @JsonDeserialize(using = OpaqueUuidDeserializer.class)
        @NotNull(message = "warehouseId 는 필수입니다")
        UUID warehouseId,

        /** 입고 구분(구매/차용) — nullable */
        String inboundType,

        /** 입고일시 — null 이면 서버 기준 now() 사용 */
        LocalDateTime receivedAt,

        /** 단위 원가 — nullable */
        BigDecimal unitCost,

        /** 입고(구매)전표 번호 — nullable, 사용자 표시용 비즈니스 식별자 */
        String inboundSlipNo) {
}
