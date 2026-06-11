package com.samhanair.logis.arologis.dto.insung;

/**
 * 인성데이타 매칭 완료/실패 webhook 수신 DTO — Phase 10 W10-2.
 *
 * <p>인성 vendor 가 배차 매칭 완료 또는 실패 시 {@code POST /internal/arologis/insung/match-result} 로 push.
 *
 * @param vendorOrderId  인성 vendor 주문번호
 * @param matched        매칭 완료 여부
 * @param vendorDriverId 배정된 기사 식별자 (매칭 성공 시)
 * @param driverName     기사 이름 (옵션)
 * @param driverPhone    기사 전화번호 (매칭 성공 시)
 * @param vehicleType    차량 종류 (옵션)
 * @param vehiclePlateNumber 차량번호 (옵션)
 * @param failReason     매칭 실패 사유 (실패 시)
 */
public record InsungMatchResultRequest(
        String vendorOrderId,
        boolean matched,
        String vendorDriverId,
        String driverName,
        String driverPhone,
        String vehicleType,
        String vehiclePlateNumber,
        String failReason
) {
}
