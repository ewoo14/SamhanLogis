package com.samhanair.logis.arologis.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

/**
 * GPS 추적 데이터 — Phase 10 W10-1.
 *
 * <p><b>BaseEntity 미상속 정책 명시 (audit-slice-3 P1-3):</b><br>
 * 본 entity 는 {@link com.samhanair.logis.common.entity.BaseEntity}를 의도적으로 상속하지 않는다.
 * <ul>
 *   <li>GPS 데이터 특성상 대량 적재가 발생하며, audit 필드(createdBy/modifiedBy 등) 가
 *       불필요한 스토리지 오버헤드를 유발한다.</li>
 *   <li>30일 retention 정책에 따라 {@code DriverLocationCleanupScheduler}가
 *       {@code capturedDate &lt; threshold} 기준으로 batch hard DELETE 를 수행한다.</li>
 *   <li>{@code @SQLRestriction} 미적용 — is_deleted 컬럼 자체가 없으므로 Soft Delete 적용 불가.
 *       GPS 데이터 삭제는 {@link com.samhanair.logis.arologis.repository.DriverLocationRepository#deleteOlderThan}
 *       을 통한 hard DELETE 가 유일한 삭제 경로이다.</li>
 *   <li>이 설계는 의도적 예외이며, 모든 업무 도메인 entity 는 반드시 BaseEntity 를 상속해야 한다
 *       (프로젝트 컨벤션 일관).</li>
 * </ul>
 *
 * <p>capturedDate (DATE) 는 partition key 후보 — DriverLocationCleanupScheduler 의 30일 cleanup
 * 기준 컬럼. capturedAt (TIMESTAMPTZ) 는 정확한 시각.
 *
 * <p>NUMERIC(10,7) GPS — 약 1.1cm 정확도 (위도 1초 = 30m / 7th decimal = 1.1cm).
 */
@Entity
@Getter
@Table(name = "driver_locations")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DriverLocation {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "driver_id", nullable = false)
    private UUID driverId;

    @Column(name = "latitude", nullable = false, precision = 10, scale = 7)
    private BigDecimal latitude;

    @Column(name = "longitude", nullable = false, precision = 10, scale = 7)
    private BigDecimal longitude;

    @Column(name = "captured_at", nullable = false)
    private LocalDateTime capturedAt;

    /** 30일 cleanup partition key. DATE 단위 (TIMESTAMPTZ 와 별개). */
    @Column(name = "captured_date", nullable = false)
    private LocalDate capturedDate;

    /**
     * 보고 source — {@link DriverLocationSource} enum string 매핑.
     *
     * <p>BE-1 / QA-3 / Designer-2 통합 채택 fix (2026-05-07) — string 자유 입력 제거 → 4값 enum.
     * VARCHAR(30) 컬럼 유지 (Flyway 변경 0).
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 30)
    private DriverLocationSource source;

    private DriverLocation(UUID driverId, BigDecimal latitude, BigDecimal longitude,
                           LocalDateTime capturedAt, DriverLocationSource source) {
        if (driverId == null) {
            throw new IllegalArgumentException("driverId 필수");
        }
        if (latitude == null || longitude == null) {
            throw new IllegalArgumentException("latitude / longitude 필수");
        }
        if (capturedAt == null) {
            throw new IllegalArgumentException("capturedAt 필수");
        }
        if (source == null) {
            throw new IllegalArgumentException("source 필수");
        }
        this.driverId = driverId;
        this.latitude = latitude;
        this.longitude = longitude;
        this.capturedAt = capturedAt;
        this.capturedDate = capturedAt.toLocalDate();
        this.source = source;
    }

    /**
     * 신규 GPS 위치 보고.
     *
     * @param driverId 기사 UUID
     * @param latitude 위도 (NUMERIC(10,7))
     * @param longitude 경도 (NUMERIC(10,7))
     * @param capturedAt 캡처 시각
     * @param source 보고 source enum ({@link DriverLocationSource})
     */
    public static DriverLocation of(UUID driverId, BigDecimal latitude, BigDecimal longitude,
                                    LocalDateTime capturedAt, DriverLocationSource source) {
        return new DriverLocation(driverId, latitude, longitude, capturedAt, source);
    }
}
