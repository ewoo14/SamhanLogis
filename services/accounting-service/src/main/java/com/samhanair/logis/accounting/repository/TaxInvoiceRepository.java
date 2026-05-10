package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.domain.TaxInvoiceType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * TaxInvoice — 세금계산서. 필터: status / 공급일자 [from, to] / partnerId.
 * 모두 nullable (null 이면 해당 조건 무시).
 */
public interface TaxInvoiceRepository extends JpaRepository<TaxInvoice, UUID> {

    /**
     * 페이지 조회 — 4개 필터 조합 (status, from, to, partnerId). null 인 필터는 무시.
     */
    @Query("""
            SELECT t FROM TaxInvoice t
            WHERE (:status IS NULL OR t.status = :status)
              AND (:from IS NULL OR t.supplyDate >= :from)
              AND (:to IS NULL OR t.supplyDate <= :to)
              AND (:partnerId IS NULL OR t.partnerId = :partnerId)
            """)
    Page<TaxInvoice> findByFilters(@Param("status") TaxInvoiceStatus status,
                                   @Param("from") LocalDate from,
                                   @Param("to") LocalDate to,
                                   @Param("partnerId") UUID partnerId,
                                   Pageable pageable);

    /**
     * 발행 상태 + 공급일자 범위 list 조회 (PR-E2 BE-A11 hometax export 용).
     *
     * <p>페이지 없이 전체 — caller (HometaxExportService) 가 100건 단위 sheet 분할.
     * 일반적으로 일별/주간 export 라 수십~수백 건 규모.
     */
    @Query("""
            SELECT t FROM TaxInvoice t
            WHERE t.status = :status
              AND t.supplyDate >= :from
              AND t.supplyDate <= :to
            ORDER BY t.supplyDate ASC, t.taxInvoiceNo ASC
            """)
    List<TaxInvoice> findIssuedInRange(@Param("status") TaxInvoiceStatus status,
                                       @Param("from") LocalDate from,
                                       @Param("to") LocalDate to);

    /**
     * 부가세신고서 집계 — ISSUED 상태 + invoiceType + 공급일자 범위 기준 합계.
     *
     * <p>반환 행: [invoiceCount (Long), supplyAmountSum (BigDecimal), vatAmountSum (BigDecimal)].
     * invoiceType 이 NULL 인 레코드는 SALES 로 간주하여 SALES 집계에 포함.
     *
     * @param invoiceType 세금계산서 종류 (SALES / PURCHASE)
     * @param from        공급일자 시작 (포함)
     * @param to          공급일자 종료 (포함)
     * @return VatSummary projection (단일 행)
     */
    @Query("""
            SELECT COUNT(t)                  AS invoiceCount,
                   COALESCE(SUM(t.supplyAmount), 0) AS supplyAmountSum,
                   COALESCE(SUM(t.vatAmount),   0) AS vatAmountSum
            FROM TaxInvoice t
            WHERE t.status = com.samhanair.logis.accounting.domain.TaxInvoiceStatus.ISSUED
              AND (t.invoiceType = :invoiceType
                   OR (:invoiceType = com.samhanair.logis.accounting.domain.TaxInvoiceType.SALES
                       AND t.invoiceType IS NULL))
              AND t.supplyDate >= :from
              AND t.supplyDate <= :to
            """)
    VatSummary aggregateVatByType(@Param("invoiceType") TaxInvoiceType invoiceType,
                                  @Param("from") LocalDate from,
                                  @Param("to") LocalDate to);

    /**
     * Spring Data JPA projection — 부가세 집계 결과.
     */
    interface VatSummary {
        Long getInvoiceCount();
        BigDecimal getSupplyAmountSum();
        BigDecimal getVatAmountSum();
    }
}
