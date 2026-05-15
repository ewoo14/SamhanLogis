package com.samhanair.logis.arologis.web.dto.detail;

import com.samhanair.logis.arologis.client.SlipClient;
import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.VehicleStop;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 아로로지스 기사앱 전표 상세 응답.
 *
 * <p>driver-facing 계약에서는 내부 dispatchId / vehicleId / stopId / slipId / downloadUrl 을 노출하지 않고,
 * 오늘 배차 target 과 화면 표시용 전표 정보만 반환한다.
 *
 * @param dispatchType 배차 유형
 * @param vehicleSequence 차량 순번
 * @param stopSequence 정차 순번
 * @param parsedKakaoSeq 카톡 원본 전표 순번
 * @param partnerName 거래처명
 * @param stopLabel 정차 표시명
 * @param slipNo 전표번호
 * @param slipDate 전표일자
 * @param deliveryAddress 배송 주소
 * @param sourceWarehouseName 출고 창고명
 * @param totalSupply 공급가 합계
 * @param vat 부가세 합계
 * @param total 총액
 * @param lines 품목 라인 목록
 */
public record DriverSlipDetailResponse(
        DispatchType dispatchType,
        Integer vehicleSequence,
        Integer stopSequence,
        Long parsedKakaoSeq,
        String partnerName,
        String stopLabel,
        String slipNo,
        LocalDate slipDate,
        String deliveryAddress,
        String sourceWarehouseName,
        BigDecimal totalSupply,
        BigDecimal vat,
        BigDecimal total,
        List<Line> lines) {

    /**
     * 오늘 정차 target 과 slip-service internal 상세 응답을 기사앱 공개 DTO 로 변환한다.
     *
     * @param dispatchType 배차 유형
     * @param vehicleSequence 차량 순번
     * @param stopSequence 정차 순번
     * @param stop 검증된 오늘 정차
     * @param detail slip-service 전체 상세
     * @return UUID 없는 전표 상세 응답
     */
    public static DriverSlipDetailResponse from(DispatchType dispatchType, Integer vehicleSequence,
                                                Integer stopSequence, VehicleStop stop,
                                                SlipClient.SlipFullDetail detail) {
        List<Line> lineResponses = detail.lines() == null
                ? List.of()
                : detail.lines().stream().map(Line::from).toList();
        return new DriverSlipDetailResponse(
                dispatchType,
                vehicleSequence,
                stopSequence,
                stop != null ? stop.getParsedKakaoSeq() : null,
                firstNonBlank(detail.partnerName(), stop != null ? stop.getParsedPartnerName() : null),
                stopLabel(stop),
                detail.slipNo(),
                detail.slipDate(),
                detail.deliveryAddress(),
                detail.sourceWarehouseName(),
                detail.totalSupply(),
                detail.vat(),
                detail.total(),
                lineResponses);
    }

    private static String stopLabel(VehicleStop stop) {
        if (stop == null) {
            return null;
        }
        return firstNonBlank(stop.getNotes(), stop.getRawText());
    }

    private static String firstNonBlank(String primary, String fallback) {
        return primary == null || primary.isBlank() ? fallback : primary;
    }

    /**
     * 기사앱 전표 상세 품목 라인.
     *
     * <p>품목 라인도 내부 lineId 를 노출하지 않고 표시와 계산에 필요한 필드만 반환한다.
     *
     * @param productName 품목명
     * @param specification 규격
     * @param quantity 수량
     * @param unitPrice 단가
     * @param lineTotal 라인 합계
     */
    public record Line(
            String productName,
            String specification,
            int quantity,
            BigDecimal unitPrice,
            BigDecimal lineTotal) {

        /** slip-service internal 라인 응답에서 공개 필드만 추출한다. */
        public static Line from(SlipClient.SlipFullLine line) {
            return new Line(
                    line.productName(),
                    line.specification(),
                    line.quantity(),
                    line.unitPrice(),
                    line.lineTotal());
        }
    }
}
