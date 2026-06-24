package com.samhanair.logis.slip.repository.external;

import com.samhanair.logis.slip.domain.external.ExternalDispatchSlip;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 타배송사 발송 이력 전표 매핑 repository. */
public interface ExternalDispatchSlipRepository extends JpaRepository<ExternalDispatchSlip, UUID> {

    List<ExternalDispatchSlip> findBySlipIdAndIsDeletedFalse(UUID slipId);

    /** 발송 이력에 포함된 전표 매핑을 인쇄 순서대로 조회한다. */
    @Query("""
            SELECT s FROM ExternalDispatchSlip s
            WHERE s.externalDispatch.id = :externalDispatchId
              AND s.isDeleted = false
            ORDER BY s.sequence ASC
            """)
    List<ExternalDispatchSlip> findPrintRowsByExternalDispatchId(
            @Param("externalDispatchId") UUID externalDispatchId);
}
