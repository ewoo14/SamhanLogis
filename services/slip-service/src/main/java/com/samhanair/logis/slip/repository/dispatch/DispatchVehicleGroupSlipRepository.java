package com.samhanair.logis.slip.repository.dispatch;

import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * {@link DispatchVehicleGroupSlip} 레포지토리 — Samhan Public Phase A.
 */
public interface DispatchVehicleGroupSlipRepository extends JpaRepository<DispatchVehicleGroupSlip, UUID> {

    List<DispatchVehicleGroupSlip> findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(UUID vehicleGroupId);

    List<DispatchVehicleGroupSlip> findByVehicleGroupIdInAndIsDeletedFalseOrderByVehicleGroupIdAscSequenceAsc(
            List<UUID> vehicleGroupIds);

    List<DispatchVehicleGroupSlip> findBySlipIdAndIsDeletedFalse(UUID slipId);

    /**
     * soft-deleted 매핑을 포함해 그룹별 매핑을 조회한다.
     *
     * <p>{@code @SQLRestriction("is_deleted = false")} 우회가 필요한 취소선 상세 read model 전용이다.
     */
    @Query(value = "SELECT * FROM dispatch_vehicle_group_slip WHERE vehicle_group_id IN (:vehicleGroupIds)",
            nativeQuery = true)
    List<DispatchVehicleGroupSlip> findByVehicleGroupIdInIncludingDeleted(
            @Param("vehicleGroupIds") List<UUID> vehicleGroupIds);

    /**
     * 매핑 id 로 soft-deleted 행까지 포함해 단건 조회한다(상세 행 지정 복원 전용).
     *
     * <p>{@code @SQLRestriction} 은 활성 행만 보여주므로 {@code findById} 로는 tombstone 을 찾을 수
     * 없다 — 상세가 노출한 매핑 id 로 특정 삭제행을 복원하려면(같은 그룹·전표에 tombstone 이 여러 건일
     * 때) native 조회가 필요하다.
     */
    @Query(value = "SELECT * FROM dispatch_vehicle_group_slip WHERE id = :id", nativeQuery = true)
    Optional<DispatchVehicleGroupSlip> findByIdIncludingDeleted(@Param("id") UUID id);

    /**
     * 그룹+전표 기준 매핑을 soft-deleted 행까지 포함해 조회한다.
     *
     * <p>활성/삭제 행이 공존하면(제거 후 같은 전표 재추가) 복원 대상인 삭제행을 우선 반환한다.
     * 이 경우 복원 가능 여부는 서비스의 활성 중복 가드가 409 로 판정한다 — 복원 강행 시
     * {@code (vehicle_group_id, slip_id)} 활성 unique 위반이 나기 때문.
     */
    @Query(value = """
            SELECT *
              FROM dispatch_vehicle_group_slip
             WHERE vehicle_group_id = :vehicleGroupId
               AND slip_id = :slipId
             ORDER BY is_deleted DESC, sequence ASC
             LIMIT 1
            """, nativeQuery = true)
    Optional<DispatchVehicleGroupSlip> findByVehicleGroupIdAndSlipIdIncludingDeleted(
            @Param("vehicleGroupId") UUID vehicleGroupId,
            @Param("slipId") UUID slipId);

    /**
     * 그룹+전표 기준 삭제 tombstone 후보 전체를 최신 삭제순으로 조회한다.
     *
     * <p>활성 partial unique 는 삭제행 중복을 막지 않으므로, 단건 복원 API 는 후보가 2건 이상이면
     * 임의 행을 복원하지 않고 서비스에서 409 로 멈춘다.
     */
    @Query(value = """
            SELECT *
              FROM dispatch_vehicle_group_slip
             WHERE vehicle_group_id = :vehicleGroupId
               AND slip_id = :slipId
               AND is_deleted = TRUE
             ORDER BY deleted_at DESC NULLS LAST, id ASC
            """, nativeQuery = true)
    List<DispatchVehicleGroupSlip> findDeletedByVehicleGroupIdAndSlipId(
            @Param("vehicleGroupId") UUID vehicleGroupId,
            @Param("slipId") UUID slipId);

    /**
     * 그룹 삭제 cascade 로 함께 삭제된 하위 매핑을 조회한다.
     *
     * <p>{@code removeVehicleGroup} 이 그룹과 하위 매핑 전체에 <b>동일한</b> {@code deleted_at} 을
     * 주입하므로(BaseEntity 공유 시각 오버로드), 같은 deletedBy + deleted_at 등호 매칭으로 cascade
     * 집합이 정확히 확정된다. 같은 사용자가 근접 시각에 개별 삭제한 매핑은 시각이 달라 제외된다.
     * (공유 시각 도입 전 데이터는 등호 불일치로 cascade 복원 대상에서 빠지며 단건 복원 경로로 처리.)
     */
    @Query(value = """
            SELECT *
              FROM dispatch_vehicle_group_slip
             WHERE vehicle_group_id = :vehicleGroupId
               AND is_deleted = TRUE
               AND deleted_by = :deletedBy
               AND deleted_at = :deletedAt
             ORDER BY sequence ASC
            """, nativeQuery = true)
    List<DispatchVehicleGroupSlip> findDeletedCascadeMappings(
            @Param("vehicleGroupId") UUID vehicleGroupId,
            @Param("deletedBy") String deletedBy,
            @Param("deletedAt") LocalDateTime deletedAt);
}
