package com.samhanair.logis.arologis.dto;

import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import java.time.LocalDate;
import java.util.List;

/**
 * 수동 배차 미리보기 응답 — Phase 10 P1-5.
 *
 * <p>{@code POST /admin/arologis/dispatches/manual/preview} 호출 결과. 저장 X — 입력값 정합성
 * 검증 + frontend confirm 단계용 echo. 실제 저장은 별도 {@code POST /manual} endpoint.
 *
 * @param dispatchDate 입력 그대로
 * @param dispatchType 입력 그대로
 * @param vehicles 차량 별 정차 echo (입력 검증 통과 후 정렬)
 * @param totalVehicles 차량 수 합계
 * @param totalStops 정차 수 합계
 * @param driverCodeApplied null 이면 자동 매칭 예정 (MockDriverMatcher = MOCK-001)
 */
public record ManualDispatchPreviewResponse(
        LocalDate dispatchDate,
        DispatchType dispatchType,
        List<PreviewVehicle> vehicles,
        int totalVehicles,
        int totalStops,
        String driverCodeApplied
) {

    public record PreviewVehicle(
            int sequence,
            VehicleTonnage tonnage,
            String label,
            List<PreviewStop> stops
    ) {}

    /**
     * 정차 1건 미리보기.
     *
     * <p>PR-E 진입 전 선행 R2 — {@code kakaoSeq} (Long, 카톡 슬립번호) 로 rename.
     * partner-service 의 partner_code (String) 와 의미 분리.
     *
     * @param sequence 정차 순서
     * @param partnerName 거래처명
     * @param address 주소
     * @param kakaoSeq 카톡 슬립번호 (Long, 옵션 — W10-4 자동 bridge 용)
     * @param notes 특이사항
     */
    public record PreviewStop(
            int sequence,
            String partnerName,
            String address,
            Long kakaoSeq,
            String partnerCode,
            String notes
    ) {}
}
