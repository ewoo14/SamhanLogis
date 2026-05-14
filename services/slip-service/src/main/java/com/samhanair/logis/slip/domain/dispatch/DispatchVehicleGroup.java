package com.samhanair.logis.slip.domain.dispatch;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * 배차 작업 내 차량 그룹 — Samhan Public Phase A.
 *
 * <p>(dispatchTaskId, sequence) 가 활성 행 unique. sequence 는 그룹 추가 순서 (1, 2, 3...).
 */
@Entity
@Getter
@Table(name = "dispatch_vehicle_group")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class DispatchVehicleGroup extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "dispatch_task_id", nullable = false)
    private UUID dispatchTaskId;

    @Column(name = "sequence", nullable = false)
    private int sequence;

    @Enumerated(EnumType.STRING)
    @Column(name = "vehicle_type", nullable = false, length = 32)
    private DispatchVehicleType vehicleType;

    private DispatchVehicleGroup(UUID dispatchTaskId, int sequence, DispatchVehicleType vehicleType) {
        if (dispatchTaskId == null) {
            throw new IllegalArgumentException("dispatchTaskId 필수");
        }
        if (sequence <= 0) {
            throw new IllegalArgumentException("sequence 는 1 이상");
        }
        if (vehicleType == null) {
            throw new IllegalArgumentException("vehicleType 필수");
        }
        this.dispatchTaskId = dispatchTaskId;
        this.sequence = sequence;
        this.vehicleType = vehicleType;
    }

    /** 신규 차량 그룹 생성. */
    public static DispatchVehicleGroup create(UUID dispatchTaskId, int sequence, DispatchVehicleType vehicleType) {
        return new DispatchVehicleGroup(dispatchTaskId, sequence, vehicleType);
    }
}
