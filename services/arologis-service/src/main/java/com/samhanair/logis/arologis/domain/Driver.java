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
 * 배송기사 — Phase 10 W10-1.
 *
 * <p>외부 vendor 매칭 기사 또는 본 어플 사용자. driverCode (사용자 노출 식별자) 와 phoneNumber 가
 * 활성 행 기준 unique. UUID 비공개 가드 — id 는 사용자 화면 노출 X.
 *
 * <p>BaseEntity 7 audit + Soft Delete (`@SQLRestriction`) 의무.
 */
@Entity
@Getter
@Table(name = "drivers")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLRestriction("is_deleted = false")
public class Driver extends BaseEntity {

    @Id
    @GeneratedValue
    @UuidGenerator
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    /** 사용자 노출 식별자 — 활성 행 기준 unique. UUID 노출 회피. */
    @Column(name = "driver_code", nullable = false, length = 50)
    private String driverCode;

    @Column(name = "driver_name", length = 50)
    private String driverName;

    @Column(name = "phone_number", length = 20)
    private String phoneNumber;

    @Column(name = "vehicle_type", length = 20)
    private String vehicleType;

    @Column(name = "vehicle_plate_number", length = 20)
    private String vehiclePlateNumber;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 30)
    private DriverSource source;

    @Column(name = "app_installed", nullable = false)
    private Boolean appInstalled;

    /**
     * 본 어플 (RN Expo) 사용 시점 user-service userId — INTERNAL 기사일 때만 설정.
     *
     * @deprecated 2026-05-14 분리 — 자체 user 도메인 도입 (Driver 가 자체 인증 식별자
     *     = phoneNumber). user-service userId 매핑은 더 이상 필요 없음. NULL 허용 유지하여
     *     기존 row 정합 보존. 새 row 는 항상 NULL.
     */
    @Deprecated(since = "2026-05-14", forRemoval = false)
    @Column(name = "app_user_id")
    private UUID appUserId;

    private Driver(String driverCode, String phoneNumber, String vehicleType,
                   DriverSource source, Boolean appInstalled, UUID appUserId) {
        this(driverCode, null, phoneNumber, vehicleType, null, source, appInstalled, appUserId);
    }

    private Driver(String driverCode, String driverName, String phoneNumber, String vehicleType,
                   String vehiclePlateNumber, DriverSource source, Boolean appInstalled, UUID appUserId) {
        if (driverCode == null || driverCode.isBlank()) {
            throw new IllegalArgumentException("driverCode 필수");
        }
        if (source == null) {
            throw new IllegalArgumentException("source 필수");
        }
        this.driverCode = driverCode;
        this.driverName = normalizeLength(driverName, 50);
        this.phoneNumber = blankToNull(phoneNumber);
        this.vehicleType = vehicleType;
        this.vehiclePlateNumber = normalizeLength(vehiclePlateNumber, 20);
        this.source = source;
        this.appInstalled = appInstalled == null ? Boolean.FALSE : appInstalled;
        this.appUserId = appUserId;
    }

    /**
     * 신규 Driver 생성.
     *
     * @param driverCode 사용자 노출 식별자
     * @param phoneNumber 전화번호 (010-XXXX-XXXX)
     * @param vehicleType 차량 종류 (옵션)
     * @param source 기사 소스
     * @param appInstalled 본 어플 설치 여부
     * @param appUserId user-service userId (INTERNAL 일 때만)
     * @return 영속화 가능한 신규 인스턴스
     */
    public static Driver of(String driverCode, String phoneNumber, String vehicleType,
                            DriverSource source, Boolean appInstalled, UUID appUserId) {
        return new Driver(driverCode, phoneNumber, vehicleType, source, appInstalled, appUserId);
    }

    /**
     * 신규 Driver 생성.
     *
     * @param driverCode 사용자 노출 식별자
     * @param driverName 기사명 (옵션)
     * @param phoneNumber 전화번호 (010-XXXX-XXXX)
     * @param vehicleType 차량 종류 (옵션)
     * @param vehiclePlateNumber 차량번호 (옵션)
     * @param source 기사 소스
     * @param appInstalled 본 어플 설치 여부
     * @param appUserId user-service userId (INTERNAL 일 때만)
     * @return 영속화 가능한 신규 인스턴스
     */
    public static Driver of(String driverCode, String driverName, String phoneNumber, String vehicleType,
                            String vehiclePlateNumber, DriverSource source, Boolean appInstalled,
                            UUID appUserId) {
        return new Driver(driverCode, driverName, phoneNumber, vehicleType, vehiclePlateNumber,
                source, appInstalled, appUserId);
    }

    /** 어플 설치 상태 갱신 (어플 설치/삭제 트리거). */
    public void updateAppInstalled(Boolean appInstalled, UUID appUserId) {
        this.appInstalled = appInstalled == null ? Boolean.FALSE : appInstalled;
        this.appUserId = appUserId;
    }

    /** 차량 종류 갱신. */
    public void updateVehicleType(String vehicleType) {
        this.vehicleType = vehicleType;
    }

    /** vendor 매칭 응답 기반 기사 프로필 갱신. null/blank 응답은 기존 값을 보존한다. */
    public void updateVendorProfile(String driverName, String phoneNumber, String vehicleType,
                                    String vehiclePlateNumber) {
        if (driverName != null && !driverName.isBlank()) {
            this.driverName = normalizeLength(driverName, 50);
        }
        if (phoneNumber != null && !phoneNumber.isBlank()) {
            this.phoneNumber = phoneNumber.trim();
        }
        if (vehicleType != null && !vehicleType.isBlank()) {
            this.vehicleType = vehicleType;
        }
        if (vehiclePlateNumber != null && !vehiclePlateNumber.isBlank()) {
            this.vehiclePlateNumber = normalizeLength(vehiclePlateNumber, 20);
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String normalizeLength(String value, int maxLength) {
        String normalized = blankToNull(value);
        if (normalized == null || normalized.length() <= maxLength) {
            return normalized;
        }
        return normalized.substring(0, maxLength);
    }
}
