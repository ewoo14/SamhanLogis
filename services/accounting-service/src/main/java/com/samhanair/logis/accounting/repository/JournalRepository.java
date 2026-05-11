package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalStatus;
import java.time.LocalDate;
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
}
