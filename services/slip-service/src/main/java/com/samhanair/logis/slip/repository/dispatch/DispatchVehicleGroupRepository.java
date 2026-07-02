package com.samhanair.logis.slip.repository.dispatch;

import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * {@link DispatchVehicleGroup} 레포지토리 — Samhan Public Phase A.
 */
public interface DispatchVehicleGroupRepository extends JpaRepository<DispatchVehicleGroup, UUID> {

    List<DispatchVehicleGroup> findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(UUID dispatchTaskId);

    Optional<DispatchVehicleGroup> findByIdAndIsDeletedFalse(UUID id);

    /**
     * soft-deleted 그룹을 포함해 UUID 로 조회한다.
     *
     * <p>{@code @SQLRestriction("is_deleted = false")} 는 네이티브 쿼리에 적용되지 않으므로
     * 삭제행 복원/취소선 상세 조회에서 사용한다.
     */
    @Query(value = "SELECT * FROM dispatch_vehicle_group WHERE id = :id", nativeQuery = true)
    Optional<DispatchVehicleGroup> findByIdIncludingDeleted(@Param("id") UUID id);

    List<DispatchVehicleGroup> findByDispatchTaskIdInAndIsDeletedFalseOrderByDispatchTaskIdAscSequenceAsc(
            List<UUID> dispatchTaskIds);

    /**
     * soft-deleted 그룹을 포함해 배차 작업별 그룹을 조회한다.
     *
     * <p>정렬은 서비스 read model 에서 활성 우선/삭제행 후순위 정책으로 재정렬한다.
     */
    @Query(value = "SELECT * FROM dispatch_vehicle_group WHERE dispatch_task_id IN (:dispatchTaskIds)",
            nativeQuery = true)
    List<DispatchVehicleGroup> findByDispatchTaskIdInIncludingDeleted(
            @Param("dispatchTaskIds") List<UUID> dispatchTaskIds);
}
