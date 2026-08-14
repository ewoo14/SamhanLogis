package com.samhanair.logis.arologis.repository;

import com.samhanair.logis.arologis.domain.Driver;
import com.samhanair.logis.arologis.domain.DriverSource;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Driver 저장소 — driverCode / phoneNumber unique lookup + source 필터.
 */
@Repository
public interface DriverRepository extends JpaRepository<Driver, UUID> {

    Optional<Driver> findByDriverCode(String driverCode);

    Optional<Driver> findByPhoneNumber(String phoneNumber);

    /**
     * 활성 (`is_deleted=false`) phoneNumber 조회 — 2026-05-14 분리 (passwordless driver login).
     *
     * <p>{@code @SQLRestriction} 가드와 같이 명시적 메서드. arologis-mobile 의 driverLogin
     * (passwordless) 진입점.
     */
    Optional<Driver> findByPhoneNumberAndIsDeletedFalse(String phoneNumber);

    /** 하이픈 표기가 섞인 기존 저장값을 migration 없이 로그인용 숫자 키로 조회한다. */
    @Query("select d from Driver d where replace(d.phoneNumber, '-', '') = :phoneNumber")
    Optional<Driver> findByNormalizedPhoneNumberAndIsDeletedFalse(@Param("phoneNumber") String phoneNumber);

    /**
     * 본 어플 사용자 (INTERNAL Driver) lookup — appUserId = user-service userId.
     *
     * <p>QA-2 채택 fix (2026-05-07) — Driver-app endpoint 풀스캔 회피. V2 partial unique index 가드
     * (`ux_drivers_app_user_active WHERE is_deleted = FALSE AND app_user_id IS NOT NULL`).
     */
    Optional<Driver> findByAppUserId(UUID appUserId);

    List<Driver> findAllBySourceOrderByCreatedAtDesc(DriverSource source);

    List<Driver> findAllBySourceAndAppInstalledOrderByCreatedAtDesc(DriverSource source, Boolean appInstalled);

    List<Driver> findAllByAppInstalledOrderByCreatedAtDesc(Boolean appInstalled);
}
