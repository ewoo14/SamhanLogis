package com.samhanair.logis.slip.repository.dispatch;

import com.samhanair.logis.slip.domain.dispatch.DispatchVehicleGroupSlip;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@link DispatchVehicleGroupSlip} 레포지토리 — Samhan Public Phase A.
 */
public interface DispatchVehicleGroupSlipRepository extends JpaRepository<DispatchVehicleGroupSlip, UUID> {

    List<DispatchVehicleGroupSlip> findByVehicleGroupIdAndIsDeletedFalseOrderBySequenceAsc(UUID vehicleGroupId);

    List<DispatchVehicleGroupSlip> findBySlipIdAndIsDeletedFalse(UUID slipId);
}
