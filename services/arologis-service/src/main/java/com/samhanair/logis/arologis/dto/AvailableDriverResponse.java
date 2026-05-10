package com.samhanair.logis.arologis.dto;

import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import java.util.List;

/**
 * 가용 기사 조회 응답 DTO — P1-5 admin UI.
 *
 * <p>{@code GET /api/v1/arologis/admin/drivers/available?date&zoneId} 응답.
 * UUID 비공개 가드 — driverCode / phoneNumber / vehicleType / source / appInstalled 만 노출.
 *
 * @param availableDrivers 가용 기사 목록
 * @param queryDate        조회 일자 (ISO YYYY-MM-DD)
 * @param zoneId           조회 권역 (null 이면 전체)
 * @param totalCount       가용 기사 총 수
 */
public record AvailableDriverResponse(
        List<AvailableDriver> availableDrivers,
        String queryDate,
        String zoneId,
        int totalCount
) {

    /**
     * 가용 기사 1건.
     *
     * @param driverCode   사용자 노출 식별자 (UUID 비공개 가드)
     * @param phoneNumber  전화번호
     * @param vehicleType  차량 종류
     * @param source       기사 소스
     * @param appInstalled 본 어플 설치 여부
     */
    public record AvailableDriver(
            String driverCode,
            String phoneNumber,
            String vehicleType,
            DriverSource source,
            Boolean appInstalled
    ) {
        /** Driver entity 에서 변환. */
        public static AvailableDriver from(Driver driver) {
            return new AvailableDriver(
                    driver.getDriverCode(),
                    driver.getPhoneNumber(),
                    driver.getVehicleType(),
                    driver.getSource(),
                    driver.getAppInstalled());
        }
    }

    /**
     * 응답 생성 헬퍼.
     *
     * @param drivers   가용 기사 도메인 리스트
     * @param queryDate 조회 일자 문자열
     * @param zoneId    권역 (null 허용)
     */
    public static AvailableDriverResponse of(List<Driver> drivers, String queryDate, String zoneId) {
        List<AvailableDriver> list = drivers.stream().map(AvailableDriver::from).toList();
        return new AvailableDriverResponse(list, queryDate, zoneId, list.size());
    }
}
