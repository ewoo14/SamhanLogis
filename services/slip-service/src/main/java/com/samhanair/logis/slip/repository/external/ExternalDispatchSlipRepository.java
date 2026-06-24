package com.samhanair.logis.slip.repository.external;

import com.samhanair.logis.slip.domain.external.ExternalDispatchSlip;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 타배송사 발송 이력 전표 매핑 repository. */
public interface ExternalDispatchSlipRepository extends JpaRepository<ExternalDispatchSlip, UUID> {

    List<ExternalDispatchSlip> findBySlipIdAndIsDeletedFalse(UUID slipId);
}
