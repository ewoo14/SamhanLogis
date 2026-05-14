package com.samhanair.logis.slip.repository.dispatch;

import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroup;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@link DispatchVehicleGroup} 레포지토리 — Samhan Public Phase A.
 */
public interface DispatchVehicleGroupRepository extends JpaRepository<DispatchVehicleGroup, UUID> {

    List<DispatchVehicleGroup> findByDispatchTaskIdAndIsDeletedFalseOrderBySequenceAsc(UUID dispatchTaskId);
}
