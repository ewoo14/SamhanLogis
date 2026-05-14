package com.samhanair.logis.slip.dto.dispatch;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Samhan Public → arologis 배차 발송 outbound payload — BE Task B8.
 *
 * <p>전송 endpoint: {@code POST /internal/arologis/dispatches} (X-Internal-Token).
 *
 * @param samhanDispatchTaskId Samhan Public 의 DispatchTask UUID (멱등 키)
 * @param taskCode 사용자 노출 식별자 (DT-YYYYMMDD-NNN)
 * @param dispatchDate 배차 날짜
 * @param vehicles 차량 그룹 목록 (정차 sequence 포함)
 */
public record ArologisDispatchRequest(
        UUID samhanDispatchTaskId,
        String taskCode,
        LocalDate dispatchDate,
        List<VehicleGroup> vehicles
) {

    /**
     * 차량 그룹 1건.
     *
     * @param sequence 그룹 순서 (1, 2, 3...)
     * @param vehicleType {@code DispatchVehicleType} enum name
     * @param slips 그룹 내 정차 (slip) 목록 (sequence 순)
     */
    public record VehicleGroup(int sequence, String vehicleType, List<SlipRef> slips) {}

    /**
     * 정차 1건 (slip snapshot).
     *
     * @param sequence 그룹 내 정차 순서 (1, 2, 3...)
     * @param slipId Samhan Public 의 slip UUID (arologis 가 회신 시 미사용, 추적용)
     * @param slipNumber 사용자 노출 식별자 ({@code 2026/05/14-001})
     * @param partnerCode 거래처 코드 (예: P-2026-0001)
     * @param partnerName 거래처명
     * @param address 인수지 주소
     * @param recipientPhoneNumber 인수자 전화번호 (Aligo SMS 발송용)
     * @param notes 특이사항
     */
    public record SlipRef(
            int sequence,
            UUID slipId,
            String slipNumber,
            String partnerCode,
            String partnerName,
            String address,
            String recipientPhoneNumber,
            String notes
    ) {}
}
