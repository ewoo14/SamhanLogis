package com.samhanair.logis.partnerorder.web.dto;

/**
 * 단일 주문 부분전환 결과 — Phase 2.6a.
 *
 * @param slipNo 발행된 출고전표 번호
 * @param orderStatus 전환 후 주문 status (DRAFT 유지 또는 CONVERTED)
 * @param fullyConverted 모든 라인이 전량 전환되었는지 여부
 */
public record ConvertResultResponse(
        String slipNo,
        String orderStatus,
        boolean fullyConverted
) {}
