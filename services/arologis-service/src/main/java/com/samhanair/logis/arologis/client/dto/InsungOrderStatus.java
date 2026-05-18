package com.samhanair.logis.arologis.client.dto;

/**
 * 인성데이타 퀵프로그램 주문 상태 DTO — Phase 10 W10-2.
 *
 * @param vendorOrderId  인성 vendor 주문번호
 * @param status         인성 vendor 상태 코드 (예: PENDING / MATCHING / ASSIGNED / DEPARTED / DELIVERED / CANCELLED)
 * @param vendorDriverId 배정된 기사 식별자 (ASSIGNED 이후)
 * @param message        상태 메시지 (옵션)
 */
public record InsungOrderStatus(
        String vendorOrderId,
        String status,
        String vendorDriverId,
        String message
) {
}
