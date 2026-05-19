package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.PurchaseSlipStatus;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PurchaseAccountingSlipRepository extends JpaRepository<PurchaseAccountingSlip, UUID> {
    Optional<PurchaseAccountingSlip> findBySlipNo(String slipNo);
    List<PurchaseAccountingSlip> findBySlipDateAndStatus(LocalDate slipDate, PurchaseSlipStatus status);
    List<PurchaseAccountingSlip> findByPartnerIdAndSlipDateBetween(UUID partnerId, LocalDate from, LocalDate to);
    List<PurchaseAccountingSlip> findByTaxInvoiceId(UUID taxInvoiceId);
}
