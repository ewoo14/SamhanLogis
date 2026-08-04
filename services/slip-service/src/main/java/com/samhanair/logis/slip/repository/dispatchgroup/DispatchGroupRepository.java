package com.samhanair.logis.slip.repository.dispatchgroup;

import com.samhanair.logis.slip.domain.dispatchgroup.DispatchGroup;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DispatchGroupRepository extends JpaRepository<DispatchGroup, UUID> {
    Optional<DispatchGroup> findByIdAndIsDeletedFalse(UUID id);
    Optional<DispatchGroup> findByGroupNoAndIsDeletedFalse(String groupNo);
    boolean existsByGroupNoAndIsDeletedFalse(String groupNo);
    boolean existsByCarrierIdAndIsDeletedFalse(UUID carrierId);
    List<DispatchGroup> findAllByDispatchDateAndIsDeletedFalseOrderByGroupNoAsc(LocalDate dispatchDate);
}
