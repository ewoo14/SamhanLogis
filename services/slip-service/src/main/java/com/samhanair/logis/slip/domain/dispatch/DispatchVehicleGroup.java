package com.samhanair.logis.slip.domain.dispatch;

import com.samhanair.logis.common.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.Objects;
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

    @Enumerated(EnumType.STRING)
    @Column(name = "vehicle_body_type", nullable = false, length = 32)
    private DispatchVehicleBodyType vehicleBodyType;

    @Enumerated(EnumType.STRING)
    @Column(name = "tonnage", length = 16)
    private DispatchTonnage tonnage;

    @Enumerated(EnumType.STRING)
    @Column(name = "dispatch_status", nullable = false, length = 20)
    private DispatchVehicleGroupDispatchStatus dispatchStatus =
            DispatchVehicleGroupDispatchStatus.PENDING;

    private DispatchVehicleGroup(
            UUID dispatchTaskId,
            int sequence,
            DispatchVehicleBodyType vehicleBodyType,
            DispatchTonnage tonnage
    ) {
        if (dispatchTaskId == null) {
            throw new IllegalArgumentException("dispatchTaskId 필수");
        }
        if (sequence <= 0) {
            throw new IllegalArgumentException("sequence 는 1 이상");
        }
        if (vehicleBodyType == null) {
            throw new IllegalArgumentException("vehicleBodyType 필수");
        }
        DispatchVehicleTypeMatrix.validate(vehicleBodyType, tonnage);
        this.dispatchTaskId = dispatchTaskId;
        this.sequence = sequence;
        this.vehicleBodyType = vehicleBodyType;
        this.tonnage = tonnage;
        this.vehicleType = deriveLegacyVehicleType(vehicleBodyType, tonnage);
        this.dispatchStatus = DispatchVehicleGroupDispatchStatus.PENDING;
    }

    /**
     * 신규 차량 그룹 생성.
     *
     * <p>{@code vehicle_type} 은 arologis 와이어 호환을 위해 차종/톤수에서 파생한 nearest legacy 값으로
     * 함께 저장한다. 이 매핑은 손실 근사이며, arologis 전송/수신 계약을 바꾸지 않기 위한 트레이드오프다.
     */
    public static DispatchVehicleGroup create(
            UUID dispatchTaskId,
            int sequence,
            DispatchVehicleBodyType vehicleBodyType,
            DispatchTonnage tonnage
    ) {
        return new DispatchVehicleGroup(dispatchTaskId, sequence, vehicleBodyType, tonnage);
    }

    /**
     * legacy 단일 enum 기반 생성.
     *
     * <p>기존 단위 테스트/보조 코드 호환용이며, 신규 API 경로는 차종/톤수 factory 를 사용한다.
     */
    public static DispatchVehicleGroup create(UUID dispatchTaskId, int sequence, DispatchVehicleType vehicleType) {
        LegacyVehicleAxes axes = fromLegacy(vehicleType);
        return create(dispatchTaskId, sequence, axes.bodyType(), axes.tonnage());
    }

    /** 아직 arologis 발송 전인 그룹인지 여부. */
    public boolean isDispatchPending() {
        return dispatchStatus == DispatchVehicleGroupDispatchStatus.PENDING;
    }

    /** 선택/전체 전송 성공 후 그룹 단위 발송 완료로 전이한다. */
    public void markDispatched() {
        this.dispatchStatus = DispatchVehicleGroupDispatchStatus.DISPATCHED;
    }

    /**
     * 차종/톤수에서 arologis 호환 legacy 차량 enum 으로 근사 변환한다.
     *
     * <p>slice1 은 Samhan Public 내부 저장/표시만 2축으로 확장하고, arologis wire 계약은 후속
     * VehicleTonnage 확장 전까지 유지한다. 따라서 {@code T_14 -> TONNAGE_10},
     * {@code T_18 -> TONNAGE_20} 처럼 일부 값은 손실 근사로 전달된다.
     */
    public static DispatchVehicleType deriveLegacyVehicleType(
            DispatchVehicleBodyType bodyType,
            DispatchTonnage tonnage
    ) {
        Objects.requireNonNull(bodyType, "bodyType 필수");
        if (bodyType == DispatchVehicleBodyType.MOTORCYCLE) {
            return DispatchVehicleType.MOTORCYCLE;
        }
        if (bodyType == DispatchVehicleBodyType.DAMAS
                || bodyType == DispatchVehicleBodyType.SEDAN
                || bodyType == DispatchVehicleBodyType.LABO) {
            return DispatchVehicleType.DAMAS;
        }
        if (tonnage == null) {
            return DispatchVehicleType.TONNAGE_1;
        }
        return switch (tonnage) {
            case T_1, T_1_2 -> DispatchVehicleType.TONNAGE_1;
            case T_1_4 -> DispatchVehicleType.TONNAGE_1_5;
            case T_2_5 -> DispatchVehicleType.TONNAGE_2_5;
            case T_3_5 -> DispatchVehicleType.TONNAGE_3;
            case T_5 -> DispatchVehicleType.TONNAGE_5;
            case T_11, T_14 -> DispatchVehicleType.TONNAGE_10;
            case T_18, T_25 -> DispatchVehicleType.TONNAGE_20;
        };
    }

    private static LegacyVehicleAxes fromLegacy(DispatchVehicleType vehicleType) {
        if (vehicleType == null) {
            throw new IllegalArgumentException("vehicleType 필수");
        }
        return switch (vehicleType) {
            case MOTORCYCLE -> new LegacyVehicleAxes(DispatchVehicleBodyType.MOTORCYCLE, null);
            case DAMAS -> new LegacyVehicleAxes(DispatchVehicleBodyType.DAMAS, null);
            case TONNAGE_1 -> new LegacyVehicleAxes(DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1);
            case TONNAGE_1_5 -> new LegacyVehicleAxes(DispatchVehicleBodyType.CARGO, DispatchTonnage.T_1_4);
            case TONNAGE_2_5 -> new LegacyVehicleAxes(DispatchVehicleBodyType.CARGO, DispatchTonnage.T_2_5);
            case TONNAGE_3 -> new LegacyVehicleAxes(DispatchVehicleBodyType.CARGO, DispatchTonnage.T_3_5);
            case TONNAGE_5 -> new LegacyVehicleAxes(DispatchVehicleBodyType.CARGO, DispatchTonnage.T_5);
            case TONNAGE_10 -> new LegacyVehicleAxes(DispatchVehicleBodyType.CARGO, DispatchTonnage.T_11);
            case TONNAGE_20 -> new LegacyVehicleAxes(DispatchVehicleBodyType.CARGO, DispatchTonnage.T_11);
        };
    }

    private record LegacyVehicleAxes(DispatchVehicleBodyType bodyType, DispatchTonnage tonnage) {}
}
