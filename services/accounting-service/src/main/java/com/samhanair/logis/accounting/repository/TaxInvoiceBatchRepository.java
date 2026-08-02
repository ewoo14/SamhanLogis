package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.TaxInvoiceBatch;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * {@link TaxInvoiceBatch} JPA Repository.
 *
 * <p>Soft Delete 필터는 {@code @SQLRestriction("is_deleted = false")} 로 전역 적용.
 */
public interface TaxInvoiceBatchRepository extends JpaRepository<TaxInvoiceBatch, UUID> {

    /**
     * 기간 필터링 저장 이력 조회 (processedAt 기준 DESC 정렬 + 페이지네이션).
     *
     * @param from      시작 일자 (inclusive, sourceFromDate 기준)
     * @param to        종료 일자 (inclusive, sourceToDate 기준)
     * @param pageable  페이지 정보
     * @return 페이지 결과
     */
    @Query("SELECT b FROM TaxInvoiceBatch b " +
           "WHERE b.documentType = 'HOMETAX' AND b.sourceFromDate >= :from AND b.sourceToDate <= :to " +
           "ORDER BY b.processedAt DESC")
    Page<TaxInvoiceBatch> findByDateRange(
            @Param("from") LocalDate from,
            @Param("to") LocalDate to,
            Pageable pageable);

    /** 문서 유형과 업무 키로 날짜별 스냅샷 이력을 조회한다. */
    @Query("SELECT b FROM TaxInvoiceBatch b WHERE b.documentType = :documentType "
            + "AND b.documentKey = :documentKey AND b.sourceFromDate >= :from "
            + "AND b.sourceToDate <= :to ORDER BY b.processedAt DESC")
    Page<TaxInvoiceBatch> findDocumentHistory(@Param("documentType") String documentType,
                                              @Param("documentKey") String documentKey,
                                              @Param("from") LocalDate from,
                                              @Param("to") LocalDate to,
                                              Pageable pageable);

    /** 사용자 노출 배치 번호로 특정 이력을 찾는다. */
    java.util.Optional<TaxInvoiceBatch> findByBatchNoAndDocumentType(String batchNo,
                                                                       String documentType);

    /**
     * 최신 배치 번호 기준 최대 숫자 suffix 조회 — 채번에 사용.
     *
     * @param prefix  채번 prefix (예: {@code TIB-202605-})
     * @return 해당 prefix 의 최대 숫자 suffix. 없으면 0
     */
    @Query(value = """
            SELECT COALESCE(MAX(CAST(substring(batch_no from length(:prefix) + 1) AS INTEGER)), 0)
            FROM tax_invoice_batches
            WHERE batch_no LIKE (:prefix || '%')
              AND is_deleted = false
              AND substring(batch_no from length(:prefix) + 1) ~ '^[0-9]+$'
            """, nativeQuery = true)
    int findMaxSequenceByBatchNoPrefix(@Param("prefix") String prefix);
}
