package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.CashDisbursement;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CashDisbursementRepository extends JpaRepository<CashDisbursement, UUID> {
}
