package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.CashReceipt;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface CashReceiptRepository extends JpaRepository<CashReceipt, UUID>,
        JpaSpecificationExecutor<CashReceipt> {

    Optional<CashReceipt> findBySlipNo(String slipNo);

    Optional<CashReceipt> findByExternalRef(String externalRef);

    boolean existsBySlipNo(String slipNo);
}
