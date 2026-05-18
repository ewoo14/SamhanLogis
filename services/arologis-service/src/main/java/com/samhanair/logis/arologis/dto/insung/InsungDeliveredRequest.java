package com.samhanair.logis.arologis.dto.insung;

/**
 * 인성데이타 배송 완료 webhook 수신 DTO — Phase 10 W10-2.
 *
 * <p>인성 vendor 기사가 전자서명 완료 + GPS 캡처 시
 * {@code POST /internal/arologis/insung/delivered} 로 push.
 *
 * @param vendorOrderId  인성 vendor 주문번호
 * @param stopSequence   완료된 정차 순서 (1-based)
 * @param signatureRef   서명 이미지 참조 (인성 vendor 파일서버 URL 또는 ref)
 * @param gpsLat         GPS 위도 (insung-lbs 소스)
 * @param gpsLng         GPS 경도 (insung-lbs 소스)
 * @param capturedAt     서명 캡처 시각 (ISO-8601)
 */
public record InsungDeliveredRequest(
        String vendorOrderId,
        Integer stopSequence,
        String signatureRef,
        Double gpsLat,
        Double gpsLng,
        String capturedAt
) {
}
