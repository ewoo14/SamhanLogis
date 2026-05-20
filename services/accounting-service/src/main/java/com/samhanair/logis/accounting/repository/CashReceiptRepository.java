package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.CashReceipt;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CashReceiptRepository extends JpaRepository<CashReceipt, UUID> {
}
