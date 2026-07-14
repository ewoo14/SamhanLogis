package com.samhanair.logis.arologis.repository;

import com.samhanair.logis.arologis.domain.DriverLocation;
import com.samhanair.logis.arologis.domain.DriverLocationSource;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * DriverLocation 저장소 — GPS 적재 + 30일 cleanup.
 *
 * <p>Hard DELETE 전용 저장소 — {@link DriverLocation} 은 {@code BaseEntity} 미상속으로
 * Soft Delete 를 지원하지 않는다 (audit-slice-3 P1-3 정책 명시).
 * 삭제는 반드시 {@link #deleteOlderThan} 를 통한 스케줄러 batch 방식으로만 수행하며,
 * 직접 hard DELETE 호출은 {@code DriverLocationCleanupScheduler} 외에서는 금지.
 */
@Repository
public interface DriverLocationRepository extends JpaRepository<DriverLocation, UUID> {

    /**
     * GPS 데이터 30일 retention 정책 batch hard DELETE.
     *
     * <p>GPS entity 는 BaseEntity 미상속 + Soft Delete 미적용이므로 hard DELETE 가
     * 유일한 삭제 경로이다. 이 메서드는 {@code DriverLocationCleanupScheduler} 에서만
     * 호출해야 하며, 개별 레코드 삭제 용도로 사용 금지.
     *
     * <p>JPQL bulk DELETE — {@code @Transactional} + {@code @Modifying} 필수.
     * 1차 캐시와의 정합성은 {@code @Modifying(clearAutomatically = true)} 옵션으로 보장.
     *
     * @param threshold 이 일자 미만 (exclusive) GPS 데이터를 모두 삭제
     * @return 삭제된 행 수
     */
    @Modifying
    @Query("delete from DriverLocation d where d.capturedDate < :threshold")
    int deleteOlderThan(@Param("threshold") LocalDate threshold);

    long countByDriverId(UUID driverId);

    List<DriverLocation> findAllByDriverIdInAndSourceInOrderByCapturedAtDesc(
            Collection<UUID> driverIds, Collection<DriverLocationSource> sources);
}
