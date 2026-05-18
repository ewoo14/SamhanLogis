package com.samhanair.logis.arologis.domain;

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
 * 차량 1대 = 카톡 "1." "2." 그룹 — Phase 10 W10-1.
 *
 * <p>(dispatchId, sequence) 가 활성 행 기준 unique. label 은 카톡 헤더 옆 텍스트 (예: "상일+초월").
 * assignedDriverId 는 매칭 완료 후 set (UUID 비공개 가드 — 응답 시 driverCode 로 변환).
 */
@Entity
@Getter
@Table(name = "vehicles")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Vehicle extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "dispatch_id", nullable = false)
    private UUID dispatchId;

    @Column(name = "sequence", nullable = false)
    private Integer sequence;

    @Enumerated(EnumType.STRING)
    @Column(name = "tonnage", nullable = false, length = 20)
    private VehicleTonnage tonnage;

    /** 카톡 헤더 옆 텍스트 (예: "상일+초월"). 옵션. */
    @Column(name = "label", length = 200)
    private String label;

    /** 매칭 완료 후 set. UUID 비공개 가드 — 응답 시 driverCode 로 변환. */
    @Column(name = "assigned_driver_id")
    private UUID assignedDriverId;

    @Enumerated(EnumType.STRING)
    @Column(name = "match_source", length = 30)
    private MatchSource matchSource;

    /** 외부 vendor reference id (인성데이타 주문번호 등). */
    @Column(name = "external_ref_id", length = 100)
    private String externalRefId;

    /**
     * 인성데이타 퀵프로그램 주문번호 — Phase 10 W10-2.
     *
     * <p>V13 migration 신규 컬럼. {@code vendor_order_id} partial unique index
     * ({@code WHERE is_deleted=false AND vendor_order_id IS NOT NULL}) 가드.
     * NULL = 인성 미사용 또는 배차 등록 전.
     */
    @Column(name = "vendor_order_id", length = 64)
    private String vendorOrderId;

    /**
     * 인성 vendor 상태 스냅샷 — Phase 10 W10-2.
     *
     * <p>webhook {@code status-update} 수신 시 동기화. idempotent upsert 용.
     * NULL = 상태 미수신.
     */
    @Column(name = "vendor_status", length = 20)
    private String vendorStatus;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private VehicleStatus status;

    private Vehicle(UUID dispatchId, Integer sequence, VehicleTonnage tonnage, String label) {
        if (dispatchId == null) {
            throw new IllegalArgumentException("dispatchId 필수");
        }
        if (sequence == null || sequence <= 0) {
            throw new IllegalArgumentException("sequence 는 1 이상");
        }
        if (tonnage == null) {
            throw new IllegalArgumentException("tonnage 필수");
        }
        this.dispatchId = dispatchId;
        this.sequence = sequence;
        this.tonnage = tonnage;
        this.label = label;
        this.status = VehicleStatus.PENDING;
    }

    /**
     * 신규 Vehicle 생성.
     *
     * @param dispatchId 소속 dispatch UUID
     * @param sequence 카톡 그룹 번호 (1, 2, 3, ...)
     * @param tonnage 차량 톤수
     * @param label 카톡 헤더 옆 텍스트 (옵션)
     */
    public static Vehicle of(UUID dispatchId, Integer sequence, VehicleTonnage tonnage, String label) {
        return new Vehicle(dispatchId, sequence, tonnage, label);
    }

    /** 매칭 진행 시작 (PENDING → MATCHING). */
    public void markMatching() {
        this.status = VehicleStatus.MATCHING;
    }

    /** 기사 배정 완료 (MATCHING / PENDING → ASSIGNED). */
    public void assignDriver(UUID driverId, MatchSource matchSource, String externalRefId) {
        if (driverId == null) {
            throw new IllegalArgumentException("driverId 필수");
        }
        if (matchSource == null) {
            throw new IllegalArgumentException("matchSource 필수");
        }
        this.assignedDriverId = driverId;
        this.matchSource = matchSource;
        this.externalRefId = externalRefId;
        this.status = VehicleStatus.ASSIGNED;
    }

    /** 출발 (ASSIGNED → DEPARTED). */
    public void markDeparted() {
        this.status = VehicleStatus.DEPARTED;
    }

    /** 모든 정차 완료 (DEPARTED → DELIVERED). */
    public void markDelivered() {
        this.status = VehicleStatus.DELIVERED;
    }

    /** 취소 — 어떤 상태에서도 호출 가능. */
    public void cancel() {
        this.status = VehicleStatus.CANCELLED;
    }

    /**
     * 인성 vendor 주문번호 갱신 — Phase 10 W10-2.
     *
     * <p>{@code InsungQuickClient.requestOrder()} 응답으로 받은 vendorOrderId 를
     * vehicle 에 기록. idempotent — 동일 값 재설정 허용.
     *
     * @param vendorOrderId 인성 vendor 주문번호 (null 허용, NULL 로 초기화 시)
     */
    public void updateVendorOrderId(String vendorOrderId) {
        this.vendorOrderId = vendorOrderId;
    }

    /**
     * 인성 vendor 상태 스냅샷 갱신 — Phase 10 W10-2.
     *
     * <p>webhook {@code status-update} / {@code delivered} 수신 시 동기화.
     * idempotent upsert 용.
     *
     * @param vendorStatus 인성 vendor 상태 코드 (예: DEPARTED / ARRIVED / DELIVERED)
     */
    public void updateVendorStatus(String vendorStatus) {
        this.vendorStatus = vendorStatus;
    }
}
