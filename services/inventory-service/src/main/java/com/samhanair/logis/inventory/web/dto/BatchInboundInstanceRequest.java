package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * S2 입고 전표 연동용 인스턴스 배치 생성 요청 DTO.
 *
 * <p>serial-managed 품목만 허용되며, 서비스 레이어가 product-service 의 {@code serialManaged}
 * 플래그를 확인해 batch 품목이면 409 CONFLICT 를 반환한다.
 */
public record BatchInboundInstanceRequest(
        /** 제품 UUID (product-service 논리 참조) — 필수 */
        @NotNull(message = "productId 는 필수입니다")
        UUID productId,

        /** 품목코드 그룹 — 필수, FIFO 인덱스 키 */
        @NotBlank(message = "productCode 는 필수이며 공백만으로 구성될 수 없습니다")
        String productCode,

        /** 입고 창고 UUID — 필수 */
        @JsonDeserialize(using = OpaqueUuidDeserializer.class)
        @NotNull(message = "warehouseId 는 필수입니다")
        UUID warehouseId,

        /** 생성 목표 수량 — 1 이상 */
        @Min(value = 1, message = "quantity 는 1 이상이어야 합니다")
        int quantity,

        /** 입고 구분(구매/차용) */
        String inboundType,

        /** 입고전표 번호 — 멱등 기준 */
        @NotBlank(message = "inboundSlipNo 는 필수이며 공백만으로 구성될 수 없습니다")
        String inboundSlipNo,

        /** 단위 원가 */
        BigDecimal unitCost,

        /** 입고일시 — null 이면 서버 기준 now() 사용 */
        LocalDateTime receivedAt,

        /** source journal 연결 정보 — 전표 파생 호출에는 필수 */
        @NotNull(message = "sourceContext 는 필수입니다") SourceOperationContext sourceContext) {
}
