package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.domain.TaxInvoiceType;
import com.samhanair.logis.accounting.web.dto.AccountingLedgerPartnerSearchResponse;
import com.samhanair.logis.accounting.web.dto.AccountingStatementSearchResponse;
import com.samhanair.logis.accounting.web.dto.AccountingTaxInvoiceSearchResponse;
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
     *
     * <p>nativeQuery=true 사용 이유: Hibernate 6 + PostgreSQL 환경에서 JPQL
     * {@code (:localDateParam IS NULL OR field >= :localDateParam)} 패턴이
     * {@code LocalDate} 타입 바인딩 시 타입 추론 오류를 발생시킵니다.
     * Native SQL 에서 CAST(:from AS DATE) 로 명시적 타입 지정하여 해결합니다.
     * countQuery 도 동일 패턴으로 명시 (Spring Data JPA 자동 생성 비신뢰).
     */
    @Query(value = """
            SELECT * FROM tax_invoices t
            WHERE t.is_deleted = false
              AND (:status IS NULL OR t.status = :status)
              AND (CAST(:from AS DATE) IS NULL OR t.supply_date >= CAST(:from AS DATE))
              AND (CAST(:to AS DATE) IS NULL OR t.supply_date <= CAST(:to AS DATE))
              AND (CAST(:partnerId AS UUID) IS NULL OR t.partner_id = CAST(:partnerId AS UUID))
            """,
            countQuery = """
            SELECT COUNT(*) FROM tax_invoices t
            WHERE t.is_deleted = false
              AND (:status IS NULL OR t.status = :status)
              AND (CAST(:from AS DATE) IS NULL OR t.supply_date >= CAST(:from AS DATE))
              AND (CAST(:to AS DATE) IS NULL OR t.supply_date <= CAST(:to AS DATE))
              AND (CAST(:partnerId AS UUID) IS NULL OR t.partner_id = CAST(:partnerId AS UUID))
            """,
            nativeQuery = true)
    Page<TaxInvoice> findByFilters(@Param("status") String status,
                                   @Param("from") LocalDate from,
                                   @Param("to") LocalDate to,
                                   @Param("partnerId") String partnerId,
                                   Pageable pageable);

    /**
     * 페이지 조회 — 5개 필터 조합 (status, type, from, to, partnerId). P0-4 신규.
     * null 인 필터는 무시.
     *
     * @param status    세금계산서 상태 (선택)
     * @param type      세금계산서 종류 SALES/PURCHASE (선택)
     * @param from      공급일자 시작 (선택)
     * @param to        공급일자 종료 (선택)
     * @param partnerId 거래처 UUID (선택)
     * @param pageable  페이지 정보
     * @return 페이지 결과
     */
    @Query("""
            SELECT t FROM TaxInvoice t
            WHERE (:status IS NULL OR t.status = :status)
              AND (:type IS NULL OR t.invoiceType = :type)
              AND (:from IS NULL OR t.supplyDate >= :from)
              AND (:to IS NULL OR t.supplyDate <= :to)
              AND (:partnerId IS NULL OR t.partnerId = :partnerId)
            ORDER BY t.supplyDate DESC, t.taxInvoiceNo DESC
            """)
    Page<TaxInvoice> findByFiltersWithType(@Param("status") TaxInvoiceStatus status,
                                           @Param("type") TaxInvoiceType type,
                                           @Param("from") LocalDate from,
                                           @Param("to") LocalDate to,
                                           @Param("partnerId") UUID partnerId,
                                           Pageable pageable);

    // [RC4] null→bytea 방지: CAST(:partnerCode AS string)
    @Query("""
            SELECT t FROM TaxInvoice t
            WHERE t.direction = com.samhanair.logis.accounting.domain.TaxInvoiceDirection.INBOUND
              AND t.supplyDate >= :from
              AND t.supplyDate <= :to
              AND (CAST(:partnerCode AS string) IS NULL OR LOWER(t.partnerCode) LIKE LOWER(CONCAT('%', CAST(:partnerCode AS string), '%')))
            ORDER BY t.supplyDate DESC, t.taxInvoiceNo DESC
            """)
    List<TaxInvoice> findInboundByFilters(@Param("from") LocalDate from,
                                          @Param("to") LocalDate to,
                                          @Param("partnerCode") String partnerCode);

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
     * 그룹웨어 결재 첨부용 세금계산서 검색.
     *
     * <p>UUID 비공개 원칙에 따라 taxInvoiceNo / supplyDate / partnerName / totalAmount 만 반환한다.
     */
    @Query("""
            SELECT new com.samhanair.logis.accounting.web.dto.AccountingTaxInvoiceSearchResponse(
                t.taxInvoiceNo,
                t.supplyDate,
                t.partnerName,
                t.totalAmount
            )
            FROM TaxInvoice t
            WHERE t.taxInvoiceNo IS NOT NULL
              AND (
                    LOWER(t.taxInvoiceNo) LIKE LOWER(CONCAT('%', :q, '%'))
                 OR LOWER(COALESCE(t.partnerName, '')) LIKE LOWER(CONCAT('%', :q, '%'))
              )
            ORDER BY t.supplyDate DESC, t.taxInvoiceNo DESC
            """)
    List<AccountingTaxInvoiceSearchResponse> searchTaxInvoiceReferences(@Param("q") String q, Pageable pageable);

    /**
     * 그룹웨어 결재 첨부용 거래명세서 검색.
     *
     * <p>거래명세서 독립 엔티티가 없어 ISSUED 세금계산서 스냅샷을 근거 문서로 반환한다.
     */
    @Query("""
            SELECT new com.samhanair.logis.accounting.web.dto.AccountingStatementSearchResponse(
                t.taxInvoiceNo,
                t.supplyDate,
                t.partnerName,
                t.totalAmount
            )
            FROM TaxInvoice t
            WHERE t.status = com.samhanair.logis.accounting.domain.TaxInvoiceStatus.ISSUED
              AND t.taxInvoiceNo IS NOT NULL
              AND (
                    LOWER(t.taxInvoiceNo) LIKE LOWER(CONCAT('%', :q, '%'))
                 OR LOWER(COALESCE(t.partnerName, '')) LIKE LOWER(CONCAT('%', :q, '%'))
              )
            ORDER BY t.supplyDate DESC, t.taxInvoiceNo DESC
            """)
    List<AccountingStatementSearchResponse> searchStatementReferences(@Param("q") String q, Pageable pageable);

    /**
     * 거래처원장 참조용 거래처 검색.
     *
     * <p>accounting-service 내부 거래처 마스터가 없으므로 세금계산서의 거래처 스냅샷을 사용한다.
     */
    @Query("""
            SELECT DISTINCT new com.samhanair.logis.accounting.web.dto.AccountingLedgerPartnerSearchResponse(
                t.partnerCode,
                t.partnerName
            )
            FROM TaxInvoice t
            WHERE t.partnerCode IS NOT NULL
              AND t.partnerCode <> ''
              AND (
                    LOWER(t.partnerCode) LIKE LOWER(CONCAT('%', :q, '%'))
                 OR LOWER(COALESCE(t.partnerName, '')) LIKE LOWER(CONCAT('%', :q, '%'))
              )
            ORDER BY t.partnerName ASC, t.partnerCode ASC
            """)
    List<AccountingLedgerPartnerSearchResponse> searchLedgerPartnerReferences(@Param("q") String q, Pageable pageable);

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
