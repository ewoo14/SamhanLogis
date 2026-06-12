package com.samhanair.logis.slip.domain.dispatch;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLRestriction;
import org.hibernate.annotations.UuidGenerator;

/**
 * arologis 회신 시 vehicle_group 에 매칭된 기사 — Samhan Public Phase A (BE Task B10).
 *
 * <p>activation: arologis 가 {@code POST /internal/slip/dispatch-tasks/{id}/confirm} 응답 시 1 차량
 * 그룹 = 1 기사 매핑 기록. {@code driverCode} 가 사용자 노출 ([feedback_uuid_no_user_visibility]).
 *
 * <p>partial unique = (vehicle_group_id) WHERE is_deleted=false → 1 그룹 = 1 매칭.
 */
@Entity
@Getter
@Table(name = "dispatch_matched_driver")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class MatchedDriver extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "vehicle_group_id", nullable = false)
    private UUID vehicleGroupId;

    @Column(name = "driver_code", nullable = false, length = 50)
    private String driverCode;

    @Column(name = "driver_name", nullable = false, length = 100)
    private String driverName;

    @Column(name = "driver_phone_number", length = 20)
    private String driverPhoneNumber;

    @Column(name = "vehicle_plate_number", length = 20)
    private String vehiclePlateNumber;

    @Column(name = "driver_source", nullable = false, length = 32)
    private String driverSource;

    private MatchedDriver(UUID vehicleGroupId, String driverCode, String driverName,
                          String driverPhoneNumber, String driverSource,
                          String vehiclePlateNumber) {
        validate(vehicleGroupId, driverCode, driverName, driverPhoneNumber, driverSource);
        this.vehicleGroupId = vehicleGroupId;
        this.driverCode = driverCode;
        this.driverName = driverName;
        this.driverPhoneNumber = driverPhoneNumber;
        this.driverSource = driverSource;
        this.vehiclePlateNumber = vehiclePlateNumber;
    }

    private static void validate(UUID vehicleGroupId, String driverCode, String driverName,
                                 String driverPhoneNumber, String driverSource) {
        if (vehicleGroupId == null) {
            throw new IllegalArgumentException("vehicleGroupId 필수");
        }
        if (driverCode == null || driverCode.isBlank()) {
            throw new IllegalArgumentException("driverCode 필수");
        }
        if (driverName == null || driverName.isBlank()) {
            throw new IllegalArgumentException("driverName 필수");
        }
        if (driverSource == null || driverSource.isBlank()) {
            throw new IllegalArgumentException("driverSource 필수");
        }
    }

    /** 신규 매칭 기사 기록. */
    public static MatchedDriver create(UUID vehicleGroupId, String driverCode, String driverName,
                                       String driverPhoneNumber, String driverSource,
                                       String vehiclePlateNumber) {
        return new MatchedDriver(vehicleGroupId, driverCode, driverName, driverPhoneNumber, driverSource,
                vehiclePlateNumber);
    }

    /** 배차담당자가 타사 기사/차량 정보를 수동 갱신한다. */
    public void updateManual(String driverCode, String driverName, String driverPhoneNumber,
                             String driverSource, String vehiclePlateNumber) {
        updateMatched(driverCode, driverName, driverPhoneNumber, driverSource, vehiclePlateNumber);
    }

    /** arologis 회신 또는 수동 입력으로 확정된 기사/차량 정보를 갱신한다. */
    public void updateMatched(String driverCode, String driverName, String driverPhoneNumber,
                              String driverSource, String vehiclePlateNumber) {
        validate(this.vehicleGroupId, driverCode, driverName, driverPhoneNumber, driverSource);
        this.driverCode = driverCode;
        this.driverName = driverName;
        this.driverPhoneNumber = driverPhoneNumber;
        this.driverSource = driverSource;
        this.vehiclePlateNumber = vehiclePlateNumber;
    }
}
