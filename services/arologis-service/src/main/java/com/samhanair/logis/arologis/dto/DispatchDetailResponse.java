package com.samhanair.logis.arologis.dto;

import com.samhanair.logis.arologis.domain.Dispatch;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.MatchSource;
import com.samhanair.logis.arologis.domain.StopStatus;
import com.samhanair.logis.arologis.domain.Vehicle;
import com.samhanair.logis.arologis.domain.VehicleStatus;
import com.samhanair.logis.arologis.domain.VehicleStop;
import com.samhanair.logis.arologis.domain.VehicleTonnage;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Dispatch 상세 응답 — vehicles + stops 포함.
 *
 * <p>UUID 비공개 가드 — assignedDriverId UUID 는 응답에서 제외 (driverCode 만 별도 lookup 후 첨부).
 * 본 PR (W10-1) 은 dispatchId 노출 (admin 화면 routing) + driverCode 매핑 (옵션).
 *
 * @param dispatchId 배차 내부 식별자. 화면 라우팅 참조용이며 사용자에게 직접 표시하지 않는다.
 * @param dispatchDate 배차 도착 일자
 * @param dispatchType 배차 유형
 * @param sandboxMode 인성 퀵프로그램 sandbox 모드 여부. 실 기사 배정/주문이 아닌 환경 표시용.
 * @param vehicles 차량 상세 목록. vehicleId UUID 는 노출하지 않고 sequence 를 행 식별자로 사용한다.
 */
@Schema(description = "아로로지스 배차 상세 응답")
public record DispatchDetailResponse(
        @Schema(description = "배차 내부 식별자. 라우팅 참조용이며 사용자 화면에는 직접 노출하지 않는다.")
        String dispatchId,
        @Schema(description = "배차 도착 일자")
        LocalDate dispatchDate,
        @Schema(description = "배차 유형")
        DispatchType dispatchType,
        @Schema(description = "인성 퀵프로그램 sandbox 모드 여부")
        boolean sandboxMode,
        @Schema(description = "차량 상세 목록")
        List<VehicleDetail> vehicles
) {

    public static DispatchDetailResponse from(Dispatch dispatch, List<Vehicle> vehicles,
                                              List<VehicleStop> stops,
                                              Map<String, String> driverIdToCode,
                                              boolean sandboxMode) {
        List<VehicleDetail> vehicleDetails = vehicles.stream()
                .map(v -> VehicleDetail.from(v, stops, driverIdToCode))
                .toList();
        return new DispatchDetailResponse(
                dispatch.getId() == null ? null : dispatch.getId().toString(),
                dispatch.getDispatchDate(),
                dispatch.getDispatchType(),
                sandboxMode,
                vehicleDetails);
    }

    /**
     * 차량 1대 상세 응답.
     *
     * <p>vehicleId UUID 는 사용자 화면에 노출하지 않는다. 행 식별은 {@code sequence} 를 사용한다.
     *
     * @param sequence 차량 순번
     * @param tonnage 차량 톤수 enum
     * @param label 카톡 헤더 옆 차량 라벨
     * @param assignedDriverCode 배정 기사 코드. 내부 driverId UUID 대신 노출한다.
     * @param matchSource 매칭 소스
     * @param externalRefId 외부 vendor 범용 참조값. 기존 계약 보존용으로 유지한다.
     * @param vendorOrderId 인성 퀵프로그램 주문번호. {@code externalRefId} 와 별도 컬럼이다.
     * @param status 차량 매칭/배송 상태
     * @param stops 차량 정차 목록
     */
    @Schema(description = "차량 1대 상세 응답")
    public record VehicleDetail(
            @Schema(description = "차량 순번. vehicleId UUID 대신 사용자 화면 행 식별자로 사용한다.")
            int sequence,
            @Schema(description = "차량 톤수 enum")
            VehicleTonnage tonnage,
            @Schema(description = "카톡 헤더 옆 차량 라벨")
            String label,
            @Schema(description = "배정 기사 코드. 내부 driverId UUID 는 노출하지 않는다.")
            String assignedDriverCode,
            @Schema(description = "매칭 소스")
            MatchSource matchSource,
            @Schema(description = "외부 vendor 범용 참조값. 기존 계약 보존용.")
            String externalRefId,
            @Schema(description = "인성 퀵프로그램 주문번호. externalRefId 와 별도 컬럼.")
            String vendorOrderId,
            @Schema(description = "차량 매칭/배송 상태")
            VehicleStatus status,
            @Schema(description = "차량 정차 목록")
            List<StopDetail> stops
    ) {
        static VehicleDetail from(Vehicle v, List<VehicleStop> allStops, Map<String, String> driverIdToCode) {
            List<StopDetail> stopDetails = allStops.stream()
                    .filter(s -> s.getVehicleId().equals(v.getId()))
                    .map(StopDetail::from)
                    .toList();
            String driverCode = null;
            if (v.getAssignedDriverId() != null && driverIdToCode != null) {
                driverCode = driverIdToCode.get(v.getAssignedDriverId().toString());
            }
            return new VehicleDetail(
                    v.getSequence(),
                    v.getTonnage(),
                    v.getLabel(),
                    driverCode,
                    v.getMatchSource(),
                    v.getExternalRefId(),
                    v.getVendorOrderId(),
                    v.getStatus(),
                    stopDetails);
        }
    }

    /**
     * 정차 1건 상세 응답.
     *
     * <p>PR-E 진입 전 선행 R2 — {@code parsedKakaoSeq} (Long, 카톡 슬립번호) 와 {@code parsedPartnerCode}
     * (String, partner-service partner_code) 를 분리. parsedPartnerCode 는 PR-E1 의 PartnerLookupClient
     * 통합 시점에 채워지며 본 PR (R2) 시점에는 항상 null.
     *
     * @param sequence 정차 순서
     * @param rawText 카톡 원본 라인
     * @param parsedAddress 파싱된 주소
     * @param parsedPartnerName 파싱된 사업자명
     * @param parsedKakaoSeq 카톡 전표번호 (Long, "(에스엠하나공조-214)" 의 214)
     * @param parsedPartnerCode partner-service partner_code (String, 예: "P-2026-0001"). PR-E1 lookup 결과.
     * @param notes 특이사항
     * @param status 정차 상태
     */
    @Schema(description = "정차 1건 상세 응답")
    public record StopDetail(
            @Schema(description = "정차 순서")
            int sequence,
            @Schema(description = "카톡 원본 라인")
            String rawText,
            @Schema(description = "파싱된 주소")
            String parsedAddress,
            @Schema(description = "파싱된 사업자명")
            String parsedPartnerName,
            @Schema(description = "카톡 전표번호")
            Long parsedKakaoSeq,
            @Schema(description = "partner-service partner_code")
            String parsedPartnerCode,
            @Schema(description = "특이사항")
            String notes,
            @Schema(description = "정차 상태")
            StopStatus status
    ) {
        static StopDetail from(VehicleStop s) {
            return new StopDetail(
                    s.getSequence(),
                    s.getRawText(),
                    s.getParsedAddress(),
                    s.getParsedPartnerName(),
                    s.getParsedKakaoSeq(),
                    s.getParsedPartnerCode(),
                    s.getNotes(),
                    s.getStatus());
        }
    }
}
