package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.SalesAccountingSlip;
import com.samhanair.logis.accounting.domain.SalesSlipStatus;
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

public interface SalesAccountingSlipRepository extends JpaRepository<SalesAccountingSlip, UUID> {
    Optional<SalesAccountingSlip> findBySlipNo(String slipNo);
    List<SalesAccountingSlip> findBySlipDateAndStatus(LocalDate slipDate, SalesSlipStatus status);

    @EntityGraph(attributePaths = {"lines", "lines.allocations"})
    @Query("""
            SELECT DISTINCT s FROM SalesAccountingSlip s
            WHERE s.slipDate = :slipDate
              AND s.status = :status
            ORDER BY s.slipNo ASC
            """)
    List<SalesAccountingSlip> findBySlipDateAndStatusWithLines(
            @Param("slipDate") LocalDate slipDate,
            @Param("status") SalesSlipStatus status);

    List<SalesAccountingSlip> findByPartnerIdAndSlipDateBetween(UUID partnerId, LocalDate from, LocalDate to);
    List<SalesAccountingSlip> findByTaxInvoiceId(UUID taxInvoiceId);

    @EntityGraph(attributePaths = {"lines", "lines.allocations"})
    @Query("""
            SELECT DISTINCT s FROM SalesAccountingSlip s
            WHERE s.slipDate >= :from
              AND s.slipDate <= :to
              AND (:partnerCode IS NULL OR LOWER(s.partnerCode) LIKE LOWER(CONCAT('%', :partnerCode, '%')))
              AND (:status IS NULL OR s.status = :status)
            ORDER BY s.slipDate DESC, s.slipNo DESC
            """)
    List<SalesAccountingSlip> findByFilters(@Param("from") LocalDate from,
                                            @Param("to") LocalDate to,
                                            @Param("partnerCode") String partnerCode,
                                            @Param("status") SalesSlipStatus status);

    @EntityGraph(attributePaths = {"lines", "lines.allocations"})
    @Query("""
            SELECT DISTINCT s FROM SalesAccountingSlip s
            WHERE s.status = com.samhanair.logis.accounting.domain.SalesSlipStatus.POSTED
              AND s.taxInvoiceId IS NULL
              AND s.slipDate >= :from
              AND s.slipDate <= :to
              AND (:partnerCode IS NULL OR LOWER(s.partnerCode) LIKE LOWER(CONCAT('%', :partnerCode, '%')))
            ORDER BY s.partnerCode ASC, s.slipDate ASC, s.slipNo ASC
            """)
    List<SalesAccountingSlip> findPostedUnlinkedForBatchCandidates(
            @Param("from") LocalDate from,
            @Param("to") LocalDate to,
            @Param("partnerCode") String partnerCode);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM SalesAccountingSlip s WHERE s.id IN :ids AND s.isDeleted = false")
    List<SalesAccountingSlip> findAllByIdsForBatch(@Param("ids") List<UUID> ids);
}
