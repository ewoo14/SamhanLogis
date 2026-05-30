package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.PurchaseAccountingSlip;
import com.samhanair.logis.accounting.domain.PurchaseSlipStatus;
import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PurchaseAccountingSlipRepository extends JpaRepository<PurchaseAccountingSlip, UUID> {
    Optional<PurchaseAccountingSlip> findBySlipNo(String slipNo);
    List<PurchaseAccountingSlip> findBySlipDateAndStatus(LocalDate slipDate, PurchaseSlipStatus status);

    @EntityGraph(attributePaths = {"lines", "lines.allocations"})
    @Query("""
            SELECT DISTINCT s FROM PurchaseAccountingSlip s
            WHERE s.slipDate = :slipDate
              AND s.status = :status
            ORDER BY s.slipNo ASC
            """)
    List<PurchaseAccountingSlip> findBySlipDateAndStatusWithLines(
            @Param("slipDate") LocalDate slipDate,
            @Param("status") PurchaseSlipStatus status);

    List<PurchaseAccountingSlip> findByPartnerIdAndSlipDateBetween(UUID partnerId, LocalDate from, LocalDate to);
    List<PurchaseAccountingSlip> findByTaxInvoiceId(UUID taxInvoiceId);

    // [RC4] null→bytea 방지: CAST(:partnerCode AS string)
    @EntityGraph(attributePaths = {"lines", "lines.allocations"})
    @Query("""
            SELECT DISTINCT s FROM PurchaseAccountingSlip s
            WHERE s.slipDate >= :from
              AND s.slipDate <= :to
              AND (CAST(:partnerCode AS string) IS NULL OR LOWER(s.partnerCode) LIKE LOWER(CONCAT('%', CAST(:partnerCode AS string), '%')))
              AND (:status IS NULL OR s.status = :status)
            ORDER BY s.slipDate DESC, s.slipNo DESC
            """)
    List<PurchaseAccountingSlip> findByFilters(@Param("from") LocalDate from,
                                               @Param("to") LocalDate to,
                                               @Param("partnerCode") String partnerCode,
                                               @Param("status") PurchaseSlipStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM PurchaseAccountingSlip s WHERE s.id IN :ids AND s.isDeleted = false")
    List<PurchaseAccountingSlip> findAllByIdsForBatch(@Param("ids") List<UUID> ids);
}
