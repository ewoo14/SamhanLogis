package com.samhanair.logis.inventory.web.dto;

import com.samhanair.logis.inventory.domain.StockInstance;
import com.samhanair.logis.inventory.domain.StockInstanceStatus;
import com.samhanair.logis.inventory.domain.StockInstanceQuality;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

/**
 * 개별시리얼 인스턴스 단건 응답 DTO.
 *
 * <p>UUID 비공개 원칙 준수 — {@code id}·{@code productId}·{@code warehouseId} 는 API key 로만 사용.
 * 사용자 화면 표시는 {@code productCode}·{@code status}·{@code inboundSlipNo}·{@code outboundSlipNo} 사용.
 */
public record StockInstanceResponse(
        /** 인스턴스 UUID — API key, 화면 미표시 */
        UUID id,
        /** UUID와 분리된 사용자 노출용 시리얼키 */
        String serialKey,
        /** 품목코드 그룹 — 사용자 표시용 */
        String productCode,
        /** 제품 UUID — API key */
        UUID productId,
        /** 창고 UUID — API key */
        UUID warehouseId,
        /** 인스턴스 상태 — 사용자 표시용 */
        StockInstanceStatus status,
        /** 재고상황과 독립된 품질 */
        StockInstanceQuality quality,
        /** 입고 구분(구매/차용) */
        String inboundType,
        /** 입고일시 (FIFO 정렬 키) */
        LocalDateTime receivedAt,
        /** 단위 원가 */
        BigDecimal unitCost,
        /** 입고전표 번호 — 사용자 표시용 비즈니스 식별자 */
        String inboundSlipNo,
        /** 출고 거래처 코드 — 사용자 표시용 */
        String outboundPartnerCode,
        /** 출고전표 번호 — 사용자 표시용 비즈니스 식별자 */
        String outboundSlipNo,
        /** 출고일시 */
        LocalDateTime outboundAt,
        /** 회수전표 번호 — 사용자 표시용 비즈니스 식별자 */
        String recallSlipNo,
        /** 생성일시 */
        LocalDateTime createdAt,
        /** 생성자 */
        String createdBy) {

    /**
     * {@link StockInstance} 도메인 객체로부터 응답 DTO 생성.
     *
     * @param instance 영속화된 StockInstance
     * @return 응답 DTO
     */
    public static StockInstanceResponse from(StockInstance instance) {
        return new StockInstanceResponse(
                instance.getId(),
                instance.getSerialKey(),
                instance.getProductCode(),
                instance.getProductId(),
                instance.getWarehouseId(),
                instance.getStatus(),
                instance.getQuality(),
                instance.getInboundType(),
                instance.getReceivedAt(),
                instance.getUnitCost(),
                instance.getInboundSlipNo(),
                instance.getOutboundPartnerCode(),
                instance.getOutboundSlipNo(),
                instance.getOutboundAt(),
                instance.getRecallSlipNo(),
                instance.getCreatedAt(),
                instance.getCreatedBy());
    }
}
