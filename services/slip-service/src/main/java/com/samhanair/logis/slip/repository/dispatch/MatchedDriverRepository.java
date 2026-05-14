package com.samhanair.logis.slip.repository.dispatch;

import com.samhanair.logis.slip.domain.dispatch.MatchedDriver;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * {@link MatchedDriver} 레포지토리 — Samhan Public Phase A (BE Task B10).
 */
public interface MatchedDriverRepository extends JpaRepository<MatchedDriver, UUID> {

    Optional<MatchedDriver> findByVehicleGroupIdAndIsDeletedFalse(UUID vehicleGroupId);
}
