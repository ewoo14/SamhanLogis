package com.samhanair.logis.partnerorder.repository;

import com.samhanair.logis.partnerorder.domain.PartnerOrderLine;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface PartnerOrderLineRepository extends JpaRepository<PartnerOrderLine, UUID> {
    /** PartnerOrder 의 모든 라인 조회 (cascade 외 별도 사용). */
    List<PartnerOrderLine> findAllByPartnerOrder_Id(UUID partnerOrderId);
}
