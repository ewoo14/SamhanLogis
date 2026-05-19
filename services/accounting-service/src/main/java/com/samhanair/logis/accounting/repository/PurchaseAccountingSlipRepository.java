package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.PurchaseSlipStatus;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PurchaseAccountingSlipRepository extends JpaRepository<PurchaseAccountingSlip, UUID> {
    Optional<PurchaseAccountingSlip> findBySlipNo(String slipNo);
    List<PurchaseAccountingSlip> findBySlipDateAndStatus(LocalDate slipDate, PurchaseSlipStatus status);
    List<PurchaseAccountingSlip> findByPartnerIdAndSlipDateBetween(UUID partnerId, LocalDate from, LocalDate to);
    List<PurchaseAccountingSlip> findByTaxInvoiceId(UUID taxInvoiceId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM PurchaseAccountingSlip s WHERE s.id IN :ids AND s.isDeleted = false")
    List<PurchaseAccountingSlip> findAllByIdsForBatch(@Param("ids") List<UUID> ids);
}
