package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.SalesCommissionSettlement;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 영업수수료 정산서 repository. */
public interface SalesCommissionSettlementRepository
        extends JpaRepository<SalesCommissionSettlement, UUID> {

    /** 활성 정산서를 문서번호로 되찾는다. */
    Optional<SalesCommissionSettlement> findByDocumentNoAndIsDeletedFalse(String documentNo);
}
