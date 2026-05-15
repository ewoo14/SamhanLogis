package com.samhanair.logis.arologis.dto;

import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStatus;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import java.time.LocalDate;
import java.util.List;

/**
 * 기사앱 오늘 배차 응답 DTO.
 *
 * <p>UUID 비공개 가드: driver-facing API 이므로 dispatch UUID / vehicle UUID / stop UUID 를 노출하지 않는다.
 * sign-and-send-copy 는 인증된 기사 + 오늘 날짜 + 배차 유형 + 차량 sequence + 정차 sequence 로 서버에서
 * 내부 dispatch 를 다시 resolve 한다.
 */
public record DriverTodayVehicleResponse(
        LocalDate dispatchDate,
        DispatchType dispatchType,
        int vehicleSequence,
        VehicleTonnage tonnage,
        String label,
        VehicleStatus status,
        List<StopDetail> stops
) {

    /**
     * 차량과 오늘 배차 metadata 로 기사앱 응답을 생성한다.
     *
     * @param dispatch 차량이 속한 오늘 배차
     * @param vehicle  기사에게 배정된 차량
     * @param stops    차량의 정차 목록
     * @return UUID 없는 기사앱 배차 응답
     */
    public static DriverTodayVehicleResponse from(Dispatch dispatch, Vehicle vehicle, List<VehicleStop> stops) {
        return new DriverTodayVehicleResponse(
                dispatch.getDispatchDate(),
                dispatch.getDispatchType(),
                vehicle.getSequence(),
                vehicle.getTonnage(),
                vehicle.getLabel(),
                vehicle.getStatus(),
                stops.stream().map(StopDetail::from).toList());
    }

    /**
     * 기사앱 정차 표시 DTO.
     *
     * <p>정차 식별은 차량 내 sequence 와 카톡 원본 순번만 노출한다. stop UUID 는 응답하지 않는다.
     */
    public record StopDetail(
            int stopSequence,
            String rawText,
            String parsedAddress,
            String parsedPartnerName,
            Long parsedKakaoSeq,
            String notes,
            StopStatus status
    ) {

        static StopDetail from(VehicleStop stop) {
            return new StopDetail(
                    stop.getSequence(),
                    stop.getRawText(),
                    stop.getParsedAddress(),
                    stop.getParsedPartnerName(),
                    stop.getParsedKakaoSeq(),
                    stop.getNotes(),
                    stop.getStatus());
        }
    }
}
