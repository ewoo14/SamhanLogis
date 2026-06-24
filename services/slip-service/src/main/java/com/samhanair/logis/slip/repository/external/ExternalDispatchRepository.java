package com.samhanair.logis.slip.repository.external;

import com.samhanair.logis.slip.domain.external.ExternalDispatch;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 타배송사 발송 이력 repository. soft-delete 는 entity SQLRestriction 으로 기본 제외한다. */
public interface ExternalDispatchRepository extends JpaRepository<ExternalDispatch, UUID> {

    List<ExternalDispatch> findByCarrierIdAndIsDeletedFalse(UUID carrierId);
}
