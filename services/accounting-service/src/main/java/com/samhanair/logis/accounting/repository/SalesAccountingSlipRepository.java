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

    // [FIX] #729-family MultipleBagFetchException — lines + lines.allocations 동시 fetch 는
    // Hibernate 6 에서 2-bag 동시 fetch 로 100% 실패(query-plan 단계). lines 만 fetch(단일 bag,
    // DISTINCT 가 정상 dedup)하고 allocations 는 SalesAccountingSlipLine#allocations 의
    // @BatchSize(100) 로 같은 트랜잭션 내 배치 로드(consumer: MonthEndCloseService.getSalesSlipDailyDetail
    // → firstSalesSourceSlipNo 가 allocations 를 읽음, @Transactional(readOnly=true) 경계 안에서 호출).
    @EntityGraph(attributePaths = {"lines"})
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

    // [RC4] null→bytea 방지: CAST(:partnerCode AS string)
    // [FIX] #729-family MultipleBagFetchException — lines 만 fetch(단일 bag), allocations 는
    // @BatchSize(100) 배치 로드(consumer: SalesAccountingSlipService.list → SalesAccountingSlipResponse.of
    // 가 line.getAllocations() 를 읽음, @Transactional(readOnly=true) 경계 안에서 호출).
    @EntityGraph(attributePaths = {"lines"})
    @Query("""
            SELECT DISTINCT s FROM SalesAccountingSlip s
            WHERE s.slipDate >= :from
              AND s.slipDate <= :to
              AND (CAST(:partnerCode AS string) IS NULL OR LOWER(s.partnerCode) LIKE LOWER(CONCAT('%', CAST(:partnerCode AS string), '%')) ESCAPE '\\')
              AND (:status IS NULL OR s.status = :status)
            ORDER BY s.slipDate DESC, s.slipNo DESC
            """)
    List<SalesAccountingSlip> findByFilters(@Param("from") LocalDate from,
                                            @Param("to") LocalDate to,
                                            @Param("partnerCode") String partnerCode,
                                            @Param("status") SalesSlipStatus status);

    // [RC4] null→bytea 방지: CAST(:partnerCode AS string)
    // [FIX] #729-family MultipleBagFetchException — root 스칼라 컬럼만 조회(EntityGraph 없음).
    // consumer(TaxInvoiceBatchFromSalesSlipsService.listCandidates → TaxInvoiceBatchCandidateResponse.of
    // / SalesSlipCandidate.of)는 slip 의 스칼라 필드(getId/getSlipNo/getSlipDate/getTotal*Amount)만
    // 읽고 lines/allocations 를 전혀 참조하지 않는다 — createFromSalesSlips 의 slip.getLines() 호출은
    // findAllByIdsForBatch 를 쓰는 별도 메서드 경로라 이 쿼리와 무관. 따라서 lines 의
    // @EntityGraph JOIN FETCH 조차 낭비이므로 제거(allocations 는 애초부터 fetch 대상이 아니었음) —
    // consumer-가-실제로-읽는-범위만 fetch 한다는 원칙을 root-only 까지 끝까지 적용.
    @Query("""
            SELECT DISTINCT s FROM SalesAccountingSlip s
            WHERE s.status = com.samhanair.logis.accounting.domain.SalesSlipStatus.POSTED
              AND s.taxInvoiceId IS NULL
              AND s.slipDate >= :from
              AND s.slipDate <= :to
              AND (CAST(:partnerCode AS string) IS NULL OR LOWER(s.partnerCode) LIKE LOWER(CONCAT('%', CAST(:partnerCode AS string), '%')) ESCAPE '\\')
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
