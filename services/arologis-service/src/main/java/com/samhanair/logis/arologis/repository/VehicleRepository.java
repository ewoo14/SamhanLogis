package com.samhanair.logis.arologis.repository;

import com.samhanair.logis.arologis.domain.DispatchType;
import com.samhanair.logis.arologis.domain.Vehicle;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Vehicle 저장소 — dispatch 단위 조회 + sequence 단건 lookup.
 */
@Repository
public interface VehicleRepository extends JpaRepository<Vehicle, UUID> {

    List<Vehicle> findAllByDispatchIdOrderBySequenceAsc(UUID dispatchId);

    Optional<Vehicle> findFirstByDispatchIdAndSequence(UUID dispatchId, Integer sequence);

    List<Vehicle> findAllByAssignedDriverIdOrderByCreatedAtDesc(UUID assignedDriverId);

    /**
     * 기사앱 오늘 배차 조회 — dispatch 날짜로 제한한다.
     *
     * @param driverId 배정 기사 내부 UUID
     * @param dispatchDate 조회 기준일
     * @return 기준일에 해당 기사에게 배정된 활성 차량 목록
     */
    @Query("""
            select v from Vehicle v
              join Dispatch d on d.id = v.dispatchId
             where v.assignedDriverId = :driverId
               and d.dispatchDate = :dispatchDate
             order by d.createdAt desc, v.sequence asc
            """)
    List<Vehicle> findAllAssignedToDriverOnDate(
            @Param("driverId") UUID driverId,
            @Param("dispatchDate") LocalDate dispatchDate);

    /**
     * UUID 없는 sign-and-send-copy target resolve 용 조회.
     *
     * @param driverId 배정 기사 내부 UUID
     * @param dispatchDate 조회 기준일
     * @param dispatchType 배차 유형
     * @param vehicleSequence 차량 sequence
     * @return 조건에 맞는 활성 차량 후보
     */
    @Query("""
            select v from Vehicle v
              join Dispatch d on d.id = v.dispatchId
             where v.assignedDriverId = :driverId
               and d.dispatchDate = :dispatchDate
               and d.dispatchType = :dispatchType
               and v.sequence = :vehicleSequence
             order by d.createdAt desc
            """)
    List<Vehicle> findAllAssignedToDriverOnDateAndTypeAndSequence(
            @Param("driverId") UUID driverId,
            @Param("dispatchDate") LocalDate dispatchDate,
            @Param("dispatchType") DispatchType dispatchType,
            @Param("vehicleSequence") Integer vehicleSequence);
}
