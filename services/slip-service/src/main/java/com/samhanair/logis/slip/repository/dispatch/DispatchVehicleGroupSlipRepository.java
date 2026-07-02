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
     * 그룹+전표 기준 매핑을 soft-deleted 행까지 포함해 조회한다.
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
     * 그룹 삭제와 같은 cascade 삭제로 판단되는 하위 매핑을 조회한다.
     *
     * <p>현재 BaseEntity 는 삭제시각 외부 주입 API 가 없어 그룹/매핑 deletedAt 이 밀리초 단위로
     * 완전 동일하다고 보장되지 않는다. 서비스는 그룹 deletedAt 기준 ±2초 창과 동일 deletedBy 로
     * 기존 개별 삭제 매핑을 제외한다.
     */
    @Query(value = """
            SELECT *
              FROM dispatch_vehicle_group_slip
             WHERE vehicle_group_id = :vehicleGroupId
               AND is_deleted = TRUE
               AND deleted_by = :deletedBy
               AND deleted_at BETWEEN :fromDeletedAt AND :toDeletedAt
             ORDER BY sequence ASC
            """, nativeQuery = true)
    List<DispatchVehicleGroupSlip> findDeletedCascadeMappings(
            @Param("vehicleGroupId") UUID vehicleGroupId,
            @Param("deletedBy") String deletedBy,
            @Param("fromDeletedAt") LocalDateTime fromDeletedAt,
            @Param("toDeletedAt") LocalDateTime toDeletedAt);
}
