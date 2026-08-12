package com.samhanair.logis.slip.repository.dispatchgroup;

import com.samhanair.logis.slip.domain.dispatchgroup.DispatchGroupSlip;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DispatchGroupSlipRepository extends JpaRepository<DispatchGroupSlip, UUID> {
    List<DispatchGroupSlip> findAllByGroupIdAndIsDeletedFalseOrderBySequenceAsc(UUID groupId);
    Optional<DispatchGroupSlip> findByGroupIdAndSlipIdAndIsDeletedFalse(UUID groupId, UUID slipId);
    boolean existsBySlipIdAndIsDeletedFalse(UUID slipId);
    Optional<DispatchGroupSlip> findFirstBySlipIdAndIsDeletedFalse(UUID slipId);
    boolean existsByGroupIdAndSlipIdAndIsDeletedFalse(UUID groupId, UUID slipId);
}
