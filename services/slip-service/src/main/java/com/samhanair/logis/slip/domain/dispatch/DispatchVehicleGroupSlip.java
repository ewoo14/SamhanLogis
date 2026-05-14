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
 * 차량 그룹 ↔ slip 매핑 — Samhan Public Phase A.
 *
 * <p>(vehicleGroupId, slipId) 활성 unique. sequence 는 그룹 내 drop 순서 (= 정차 순서).
 */
@Entity
@Getter
@Table(name = "dispatch_vehicle_group_slip")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class DispatchVehicleGroupSlip extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "vehicle_group_id", nullable = false)
    private UUID vehicleGroupId;

    @Column(name = "slip_id", nullable = false)
    private UUID slipId;

    @Column(name = "sequence", nullable = false)
    private int sequence;

    private DispatchVehicleGroupSlip(UUID vehicleGroupId, UUID slipId, int sequence) {
        if (vehicleGroupId == null) {
            throw new IllegalArgumentException("vehicleGroupId 필수");
        }
        if (slipId == null) {
            throw new IllegalArgumentException("slipId 필수");
        }
        if (sequence <= 0) {
            throw new IllegalArgumentException("sequence 는 1 이상");
        }
        this.vehicleGroupId = vehicleGroupId;
        this.slipId = slipId;
        this.sequence = sequence;
    }

    /** 신규 매핑 생성. */
    public static DispatchVehicleGroupSlip create(UUID vehicleGroupId, UUID slipId, int sequence) {
        return new DispatchVehicleGroupSlip(vehicleGroupId, slipId, sequence);
    }

    /** 정차 순서 갱신 (reorder). */
    public void updateSequence(int sequence) {
        if (sequence <= 0) {
            throw new IllegalArgumentException("sequence 는 1 이상");
        }
        this.sequence = sequence;
    }
}
