package com.samhanair.logis.arologis.dto;

import com.samhanair.logis.arologis.domain.DriverLocationSource;
import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 배차 상세 GPS source 응답.
 *
 * <p>source enum 이름은 FE {@code GpsSourceKey} 와 1:1 계약이다.
 *
 * @param source GPS source 종류
 * @param latitude 위도
 * @param longitude 경도
 * @param lastReceivedAt 마지막 수신 시각
 * @param active 우선순위와 stale threshold 기준 활성 source 여부
 */
@Schema(description = "배차 상세 GPS source 응답")
public record GpsSource(
        @Schema(description = "GPS source 종류. FE GpsSourceKey enum 이름과 동일하다.")
        DriverLocationSource source,
        @Schema(description = "위도. 좌표가 없으면 null.")
        BigDecimal latitude,
        @Schema(description = "경도. 좌표가 없으면 null.")
        BigDecimal longitude,
        @Schema(description = "마지막 수신 시각. ISO-8601 LocalDateTime.")
        LocalDateTime lastReceivedAt,
        @Schema(description = "우선순위와 stale threshold 기준 활성 source 여부.")
        boolean active
) {

    /** 비활성 GPS source 후보 생성. */
    public static GpsSource inactive(DriverLocationSource source, BigDecimal latitude,
                                     BigDecimal longitude, LocalDateTime lastReceivedAt) {
        return new GpsSource(source, latitude, longitude, lastReceivedAt, false);
    }

    /** 활성 플래그만 교체한 새 응답 인스턴스. */
    public GpsSource withActive(boolean nextActive) {
        return new GpsSource(source, latitude, longitude, lastReceivedAt, nextActive);
    }
}
