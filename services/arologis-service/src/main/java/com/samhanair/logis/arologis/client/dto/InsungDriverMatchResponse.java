package com.samhanair.logis.arologis.client.dto;

/**
 * 인성데이타 퀵프로그램 기사 매칭 응답 DTO — Phase 10 W10-2.
 *
 * <p>UUID 비공개 가드: {@code vendorDriverId} 는 인성 vendor 측 식별자 (문자열).
 * 서비스 내부에서 {@code INSUNG-<vendorDriverId>} 로 변환하여 driverCode 로 사용.
 *
 * @param matched       매칭 완료 여부 ({@code false} = 진행 중 또는 실패)
 * @param vendorDriverId 인성 vendor 기사 식별자 (매칭 성공 시만 유효)
 * @param driverName    기사 이름 (옵션)
 * @param driverPhone   기사 전화번호
 * @param vehicleType   차량 종류 (옵션, 예: "1톤")
 * @param vehiclePlateNumber 차량번호 (옵션)
 * @param failReason    매칭 실패 사유 (실패 시만)
 */
public record InsungDriverMatchResponse(
        boolean matched,
        String vendorDriverId,
        String driverName,
        String driverPhone,
        String vehicleType,
        String vehiclePlateNumber,
        String failReason
) {

    /**
     * 매칭 성공 응답 생성.
     *
     * @param vendorDriverId 인성 vendor 기사 식별자
     * @param driverName     기사 이름
     * @param driverPhone    기사 전화번호
     * @param vehicleType    차량 종류
     */
    public static InsungDriverMatchResponse matched(String vendorDriverId, String driverName,
                                                     String driverPhone, String vehicleType) {
        return matched(vendorDriverId, driverName, driverPhone, vehicleType, null);
    }

    /**
     * 매칭 성공 응답 생성.
     *
     * @param vendorDriverId 인성 vendor 기사 식별자
     * @param driverName     기사 이름
     * @param driverPhone    기사 전화번호
     * @param vehicleType    차량 종류
     * @param vehiclePlateNumber 차량번호
     */
    public static InsungDriverMatchResponse matched(String vendorDriverId, String driverName,
                                                     String driverPhone, String vehicleType,
                                                     String vehiclePlateNumber) {
        return new InsungDriverMatchResponse(true, vendorDriverId, driverName, driverPhone,
                vehicleType, vehiclePlateNumber, null);
    }

    /**
     * 매칭 진행 중 응답 생성.
     */
    public static InsungDriverMatchResponse pending() {
        return new InsungDriverMatchResponse(false, null, null, null, null, null, "매칭 진행 중");
    }

    /**
     * 매칭 실패 응답 생성.
     *
     * @param reason 실패 사유
     */
    public static InsungDriverMatchResponse failed(String reason) {
        return new InsungDriverMatchResponse(false, null, null, null, null, null, reason);
    }
}
