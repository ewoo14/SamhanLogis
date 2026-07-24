package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.domain.JournalStatus;
import com.samhanair.logis.accounting.web.dto.AccountingJournalSearchResponse;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Journal — 분개장. journalDate 범위 + status 필터 페이지 조회. */
public interface JournalRepository extends JpaRepository<Journal, UUID> {

    /**
     * 기간 + 상태 페이지 조회. status null 이면 전체 상태 포함.
     * journalDate 오름차순(최근부터 보고 싶으면 caller 가 Pageable Sort 지정).
     */
    @Query("""
            SELECT j FROM Journal j
            WHERE j.journalDate >= :from
              AND j.journalDate <= :to
              AND (:status IS NULL OR j.status = :status)
            """)
    Page<Journal> findByDateRangeAndStatus(@Param("from") LocalDate from,
                                           @Param("to") LocalDate to,
                                           @Param("status") JournalStatus status,
                                           Pageable pageable);

    /**
     * 분개번호 존재 여부 — JournalSeeder idempotent 체크 (cleanup 후 재가동 시 unique 충돌 회피).
     * Soft-delete row 도 포함 (journal_no unique partial index 가 is_deleted=FALSE 만 적용).
     */
    boolean existsByJournalNo(String journalNo);

    /**
     * 그룹웨어 결재 첨부용 분개장 검색.
     *
     * <p>UUID 비공개 원칙에 따라 journalNo / journalDate / description / 금액만 반환한다.
     * 금액은 차변 합계 기준이며, 라인이 없으면 0 으로 반환한다.
     */
    @Query("""
            SELECT new com.samhanair.logis.accounting.web.dto.AccountingJournalSearchResponse(
                j.journalNo,
                j.journalDate,
                j.description,
                COALESCE(SUM(l.debitAmount), 0)
            )
            FROM Journal j
            LEFT JOIN j.lines l
            WHERE LOWER(j.journalNo) LIKE LOWER(CONCAT('%', :q, '%')) ESCAPE '\\'
               OR LOWER(COALESCE(j.description, '')) LIKE LOWER(CONCAT('%', :q, '%')) ESCAPE '\\'
            GROUP BY j.id, j.journalNo, j.journalDate, j.description
            ORDER BY j.journalDate DESC, j.journalNo DESC
            """)
    List<AccountingJournalSearchResponse> searchApprovalReferences(@Param("q") String q, Pageable pageable);

    /**
     * 전표현황 보고서용 전표 헤더 + 차/대 합계 조회.
     *
     * <p>컬렉션 fetch join 을 사용하지 않고 root 전표 기준으로 GROUP BY 하여
     * 라인 수만큼 root 가 중복되는 JPA 카르테시안 문제를 피한다. 거래처 필터는
     * {@code EXISTS} 로만 판정하므로 전표 전체 차/대 합계를 유지한다.
     */
    @Query("""
            SELECT j.id AS journalId,
                   j.journalNo AS journalNo,
                   j.journalDate AS journalDate,
                   j.sourceType AS sourceType,
                   j.status AS status,
                   j.description AS description,
                   COALESCE(SUM(l.debitAmount), 0) AS totalDebit,
                   COALESCE(SUM(l.creditAmount), 0) AS totalCredit
            FROM Journal j
            LEFT JOIN j.lines l
            WHERE j.journalDate >= :from
              AND j.journalDate <= :to
              AND j.status = :status
              AND (:allSourceTypes = true OR j.sourceType IN :sourceTypes)
              AND (:partnerId IS NULL OR EXISTS (
                    SELECT 1
                    FROM JournalLine pl
                    WHERE pl.journal = j
                      AND pl.partnerId = :partnerId
              ))
            GROUP BY j.id, j.journalNo, j.journalDate, j.sourceType, j.status, j.description
            ORDER BY j.journalDate ASC, j.journalNo ASC
            """)
    List<JournalStatusReportRow> findJournalStatusReportRows(
            @Param("from") LocalDate from,
            @Param("to") LocalDate to,
            @Param("status") JournalStatus status,
            @Param("sourceTypes") Collection<JournalSourceType> sourceTypes,
            @Param("allSourceTypes") boolean allSourceTypes,
            @Param("partnerId") UUID partnerId);

    /**
     * 전표현황 거래처 grouping 전용 라인 거래처별 fan-out 조회.
     *
     * <p>전표 전체 합계를 대표 거래처로 몰지 않고 {@code journal_lines.partner_id} 별 차/대
     * 부분합을 반환한다. 거래처 필터는 UUID 해석 이후 내부 조건으로만 적용한다.
     */
    @Query("""
            SELECT j.id AS journalId,
                   j.journalNo AS journalNo,
                   j.journalDate AS journalDate,
                   j.sourceType AS sourceType,
                   j.status AS status,
                   j.description AS description,
                   l.partnerId AS partnerId,
                   COALESCE(SUM(l.debitAmount), 0) AS totalDebit,
                   COALESCE(SUM(l.creditAmount), 0) AS totalCredit
            FROM Journal j
            LEFT JOIN j.lines l
            WHERE j.journalDate >= :from
              AND j.journalDate <= :to
              AND j.status = :status
              AND (:allSourceTypes = true OR j.sourceType IN :sourceTypes)
              AND (:partnerId IS NULL OR l.partnerId = :partnerId)
            GROUP BY j.id, j.journalNo, j.journalDate, j.sourceType, j.status, j.description, l.partnerId
            ORDER BY j.journalDate ASC, j.journalNo ASC
            """)
    List<JournalStatusPartnerReportRow> findJournalStatusPartnerReportRows(
            @Param("from") LocalDate from,
            @Param("to") LocalDate to,
            @Param("status") JournalStatus status,
            @Param("sourceTypes") Collection<JournalSourceType> sourceTypes,
            @Param("allSourceTypes") boolean allSourceTypes,
            @Param("partnerId") UUID partnerId);

    /**
     * 전표현황 보고서용 전표별 거래처 ID 목록 조회.
     *
     * <p>응답에는 UUID 를 포함하지 않고 service 에서 거래처명으로 변환한다.
     */
    @Query("""
            SELECT l.journal.id AS journalId,
                   l.partnerId AS partnerId
            FROM JournalLine l
            WHERE l.journal.id IN :journalIds
              AND l.partnerId IS NOT NULL
            GROUP BY l.journal.id, l.partnerId
            """)
    List<JournalPartnerRow> findPartnerRowsByJournalIds(@Param("journalIds") Collection<UUID> journalIds);

    /** 전표현황 전표 행 projection. */
    interface JournalStatusReportRow {
        UUID getJournalId();
        String getJournalNo();
        LocalDate getJournalDate();
        JournalSourceType getSourceType();
        JournalStatus getStatus();
        String getDescription();
        BigDecimal getTotalDebit();
        BigDecimal getTotalCredit();
    }

    /** 전표별 거래처 ID projection. */
    interface JournalPartnerRow {
        UUID getJournalId();
        UUID getPartnerId();
    }

    /** 전표현황 거래처 grouping fan-out projection. */
    interface JournalStatusPartnerReportRow {
        UUID getJournalId();
        String getJournalNo();
        LocalDate getJournalDate();
        JournalSourceType getSourceType();
        JournalStatus getStatus();
        String getDescription();
        UUID getPartnerId();
        BigDecimal getTotalDebit();
        BigDecimal getTotalCredit();
    }
}
