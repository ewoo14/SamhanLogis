package com.samhanair.logis.arologis.repository;

import com.samhanair.logis.arologis.domain.DriverLocation;
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

    /**
     * driverId + source 조합별 최신 GPS 위치 1건씩 조회 — Postgres {@code DISTINCT ON} 활용.
     *
     * <p>driver_locations 는 기사 앱이 약 30초 주기로 좌표를 보고하는 대량 적재 테이블이다.
     * 기존 방식(전체 이력 fetch 후 애플리케이션에서 최신 1건만 골라내기)은 driverIds 의 30일치
     * GPS 이력을 통째로 읽어와 대부분 버리는 과다 조회였다. 본 메서드는 Postgres
     * {@code DISTINCT ON (driver_id, source)} 로 DB 단에서 최신 1건만 반환하도록 하여, 결과
     * 행 수를 최대 {@code driverIds.size() * sources.size()} 로 bound 시킨다
     * (V23 인덱스 {@code ix_driver_locations_driver_source_captured} 가 이 조회 패턴을 커버).
     *
     * <p>{@code source} 컬럼은 {@code VARCHAR(30)} 매핑이므로, native query 파라미터는
     * enum 객체가 아닌 {@code Enum#name()} 문자열 컬렉션으로 전달해야 안정적으로 바인딩된다
     * ({@link com.samhanair.logis.arologis.service.GpsSourceAssembler} 호출부 참조).
     *
     * @param driverIds 조회 대상 기사 UUID 목록
     * @param sources 조회 대상 source 이름 (enum name 문자열) 목록
     * @return driverId, source 조합별 captured_at 최신 1건씩 (조합당 최대 1행)
     */
    @Query(value = "SELECT DISTINCT ON (driver_id, source) * FROM driver_locations "
            + "WHERE driver_id IN (:driverIds) AND source IN (:sources) "
            + "ORDER BY driver_id, source, captured_at DESC", nativeQuery = true)
    List<DriverLocation> findLatestPerDriverAndSource(@Param("driverIds") Collection<UUID> driverIds,
                                                      @Param("sources") Collection<String> sources);
}
