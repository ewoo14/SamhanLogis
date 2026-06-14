package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalStatus;
import com.samhanair.logis.accounting.web.dto.AccountingJournalSearchResponse;
import java.time.LocalDate;
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
            WHERE LOWER(j.journalNo) LIKE LOWER(CONCAT('%', :q, '%'))
               OR LOWER(COALESCE(j.description, '')) LIKE LOWER(CONCAT('%', :q, '%'))
            GROUP BY j.id, j.journalNo, j.journalDate, j.description
            ORDER BY j.journalDate DESC, j.journalNo DESC
            """)
    List<AccountingJournalSearchResponse> searchApprovalReferences(@Param("q") String q, Pageable pageable);
}
