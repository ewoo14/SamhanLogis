package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.SalesCommissionRateContract;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

/** 영업수수료 versioned 요율 계약 repository. */
public interface SalesCommissionRateContractRepository
        extends JpaRepository<SalesCommissionRateContract, UUID> {

    /** 활성 계약을 버전 번호로 조회한다. */
    Optional<SalesCommissionRateContract> findByVersionNoAndIsDeletedFalse(int versionNo);
}
