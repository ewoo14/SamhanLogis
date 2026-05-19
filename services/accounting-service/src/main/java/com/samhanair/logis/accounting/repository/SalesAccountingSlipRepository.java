package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SalesAccountingSlipRepository extends JpaRepository<SalesAccountingSlip, UUID> {
    Optional<SalesAccountingSlip> findBySlipNo(String slipNo);
    List<SalesAccountingSlip> findBySlipDateAndStatus(LocalDate slipDate, SalesSlipStatus status);
    List<SalesAccountingSlip> findByPartnerIdAndSlipDateBetween(UUID partnerId, LocalDate from, LocalDate to);
    List<SalesAccountingSlip> findByTaxInvoiceId(UUID taxInvoiceId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM SalesAccountingSlip s WHERE s.id IN :ids AND s.isDeleted = false")
    List<SalesAccountingSlip> findAllByIdsForBatch(@Param("ids") List<UUID> ids);
}
