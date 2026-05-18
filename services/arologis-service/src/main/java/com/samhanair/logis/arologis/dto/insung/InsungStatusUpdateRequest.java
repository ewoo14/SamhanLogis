package com.samhanair.logis.arologis.dto.insung;

/**
 * 인성데이타 상태 변경 webhook 수신 DTO — Phase 10 W10-2.
 *
 * <p>인성 vendor 가 기사 출발/도착 이벤트 발생 시
 * {@code POST /internal/arologis/insung/status-update} 로 push.
 *
 * @param vendorOrderId 인성 vendor 주문번호
 * @param status        변경된 상태 (DEPARTED | ARRIVED)
 * @param stopSequence  도착 정차 순서 (ARRIVED 이벤트 시, 1-based)
 * @param gpsLat        GPS 위도 (옵션)
 * @param gpsLng        GPS 경도 (옵션)
 * @param eventTime     이벤트 발생 시각 (ISO-8601, 옵션)
 */
public record InsungStatusUpdateRequest(
        String vendorOrderId,
        String status,
        Integer stopSequence,
        Double gpsLat,
        Double gpsLng,
        String eventTime
) {
}
