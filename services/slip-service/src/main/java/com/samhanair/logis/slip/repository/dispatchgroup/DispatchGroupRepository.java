package com.samhanair.logis.slip.repository.dispatchgroup;

import com.samhanair.logis.slip.domain.dispatchgroup.DispatchGroup;
import com.samhanair.logis.slip.domain.dispatchgroup.TransferStatus;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DispatchGroupRepository extends JpaRepository<DispatchGroup, UUID> {
    Optional<DispatchGroup> findByGroupNoAndIsDeletedFalse(String groupNo);
    boolean existsByGroupNoAndIsDeletedFalse(String groupNo);
    boolean existsByCarrierIdAndIsDeletedFalse(UUID carrierId);
    boolean existsByCarrierIdAndTransferStatusInAndIsDeletedFalse(UUID carrierId, java.util.Collection<TransferStatus> statuses);
    List<DispatchGroup> findAllByTransferStatusAndIsDeletedFalseOrderByModifiedAtAsc(TransferStatus transferStatus, Pageable pageable);
    List<DispatchGroup> findAllByDispatchDateAndIsDeletedFalseOrderByGroupNoAsc(LocalDate dispatchDate);
}
