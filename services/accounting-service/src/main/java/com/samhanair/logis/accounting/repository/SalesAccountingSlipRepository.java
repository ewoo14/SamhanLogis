package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SalesAccountingSlipRepository extends JpaRepository<SalesAccountingSlip, UUID> {
    Optional<SalesAccountingSlip> findBySlipNo(String slipNo);
    List<SalesAccountingSlip> findBySlipDateAndStatus(LocalDate slipDate, SalesSlipStatus status);
    List<SalesAccountingSlip> findByPartnerIdAndSlipDateBetween(UUID partnerId, LocalDate from, LocalDate to);
    List<SalesAccountingSlip> findByTaxInvoiceId(UUID taxInvoiceId);
}
