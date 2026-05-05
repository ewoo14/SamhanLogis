package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.domain.PartnerOrderHistory;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PartnerOrderHistoryRepository extends JpaRepository<PartnerOrderHistory, UUID> {
    /** 단건 PartnerOrder 의 모든 history (occurredAt ASC). */
    List<PartnerOrderHistory> findAllByPartnerOrderIdOrderByOccurredAtAsc(UUID partnerOrderId);

    List<PartnerOrderHistory> findAllByDraftIdOrderByOccurredAtAsc(UUID draftId);
}
