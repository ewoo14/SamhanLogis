package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** JournalLine — 분개 라인. 시산표 집계용 native projection 제공. */
public interface JournalLineRepository extends JpaRepository<JournalLine, UUID> {

    /**
     * 시산표 집계용 — accountCode 별 debit/credit 합계 (POSTED 분개만 포함).
     * 기간 [from, to] 의 journalDate 를 가진 분개의 라인만 집계.
     *
     * <p>반환 row: [accountCode (String), debitTotal (BigDecimal), creditTotal (BigDecimal)].
     */
    @Query("""
            SELECT l.accountCode AS accountCode,
                   COALESCE(SUM(l.debitAmount), 0) AS debitTotal,
                   COALESCE(SUM(l.creditAmount), 0) AS creditTotal
            FROM JournalLine l
            WHERE l.journal.journalDate >= :from
              AND l.journal.journalDate <= :to
              AND l.journal.status = :status
            GROUP BY l.accountCode
            """)
    List<AccountTotal> aggregateByAccount(@Param("from") LocalDate from,
                                          @Param("to") LocalDate to,
                                          @Param("status") JournalStatus status);

    /** Spring Data JPA projection — accountCode 별 차/대 합계. */
    interface AccountTotal {
        String getAccountCode();
        BigDecimal getDebitTotal();
        BigDecimal getCreditTotal();
    }

    /**
     * 마감 합계 집계용 — 계정 대분류(앞 1자리 = 1/2/3/4/5/8/9) prefix 로 그룹핑.
     * 본 슬라이스에서는 service 가 호출 후 prefix 그룹별로 합산. POSTED 분개만 집계.
     */
    @Query("""
            SELECT l.accountCode AS accountCode,
                   COALESCE(SUM(l.debitAmount), 0) AS debitTotal,
                   COALESCE(SUM(l.creditAmount), 0) AS creditTotal
            FROM JournalLine l
            WHERE l.journal.journalDate >= :from
              AND l.journal.journalDate <= :to
              AND l.journal.status = com.samhanair.logis.accounting.domain.JournalStatus.POSTED
            GROUP BY l.accountCode
            """)
    List<AccountTotal> aggregatePostedByAccount(@Param("from") LocalDate from,
                                                @Param("to") LocalDate to);

    /**
     * 거래처 + 계정코드 별 차/대 합계 — PR-E2 BE-A8 매출/수금/채권 집계용.
     *
     * <p>POSTED 분개의 라인만 집계. {@code partnerId} 가 NULL 인 라인은 제외 (집계 대상이 아님).
     * 응답 row 는 [partnerId, accountCode, debitTotal, creditTotal].
     */
    @Query("""
            SELECT l.partnerId AS partnerId,
                   l.accountCode AS accountCode,
                   COALESCE(SUM(l.debitAmount), 0) AS debitTotal,
                   COALESCE(SUM(l.creditAmount), 0) AS creditTotal
            FROM JournalLine l
            WHERE l.journal.journalDate >= :from
              AND l.journal.journalDate <= :to
              AND l.journal.status = com.samhanair.logis.accounting.domain.JournalStatus.POSTED
              AND l.partnerId IS NOT NULL
            GROUP BY l.partnerId, l.accountCode
            """)
    List<PartnerAccountTotal> aggregatePostedByPartnerAccount(@Param("from") LocalDate from,
                                                              @Param("to") LocalDate to);

    /** Spring Data JPA projection — 거래처 + 계정코드 별 차/대 합계. */
    interface PartnerAccountTotal {
        UUID getPartnerId();
        String getAccountCode();
        BigDecimal getDebitTotal();
        BigDecimal getCreditTotal();
    }

    /**
     * 거래처별 110(외상매출금) 누적 잔액 — A9 원장 데이터의 잔액 컬럼용.
     *
     * <p>POSTED 분개 라인만 합. 잔액 = SUM(debit) - SUM(credit).
     * caller 가 partnerId 별로 호출하거나 batch 로 partnerId IN (..) 을 사용.
     */
    @Query("""
            SELECT l FROM JournalLine l
            WHERE l.partnerId = :partnerId
              AND l.accountCode = :accountCode
              AND l.journal.journalDate <= :asOf
              AND l.journal.status = com.samhanair.logis.accounting.domain.JournalStatus.POSTED
            ORDER BY l.journal.journalDate ASC, l.journal.journalNo ASC, l.lineNo ASC
            """)
    List<JournalLine> findLinesUpTo(@Param("partnerId") UUID partnerId,
                                    @Param("accountCode") String accountCode,
                                    @Param("asOf") LocalDate asOf);

    /**
     * 거래처별 기간 분개 라인 — A9 원장 데이터 (전 계정 통합). POSTED 분개만.
     */
    @Query("""
            SELECT l FROM JournalLine l
            WHERE l.partnerId = :partnerId
              AND l.journal.journalDate >= :from
              AND l.journal.journalDate <= :to
              AND l.journal.status = com.samhanair.logis.accounting.domain.JournalStatus.POSTED
            ORDER BY l.journal.journalDate ASC, l.journal.journalNo ASC, l.lineNo ASC
            """)
    List<JournalLine> findPartnerLinesInRange(@Param("partnerId") UUID partnerId,
                                              @Param("from") LocalDate from,
                                              @Param("to") LocalDate to);

    /**
     * 재무상태표 집계용 — asOfDate 이전 누적 POSTED 분개 라인의 accountCode 별 차/대 합계.
     *
     * <p>B/S 에서는 기간 제한 없이 설립 이후 전체 누적 잔액이 필요하므로
     * journalDate &lt;= asOfDate 조건만 사용한다.
     *
     * @param asOfDate 기준 일자 (이 날짜 포함 이전까지 누적)
     * @return accountCode 별 차/대 합계 행
     */
    @Query("""
            SELECT l.accountCode AS accountCode,
                   COALESCE(SUM(l.debitAmount), 0) AS debitTotal,
                   COALESCE(SUM(l.creditAmount), 0) AS creditTotal
            FROM JournalLine l
            WHERE l.journal.journalDate <= :asOfDate
              AND l.journal.status = com.samhanair.logis.accounting.domain.JournalStatus.POSTED
            GROUP BY l.accountCode
            """)
    List<AccountTotal> aggregatePostedUpTo(@Param("asOfDate") LocalDate asOfDate);

    /**
     * 거래처별 미수/미지급금 집계 — asOfDate 이전 누적 POSTED 분개 라인.
     *
     * <p>partnerId 가 NULL 이 아닌 라인만 집계. 거래처 + accountCode 별 차/대 합산.
     * partner_aging 보고서에서 110(외상매출금) / 201(외상매입금) 계정 잔액 집계에 사용.
     *
     * @param accountCode 대상 계정 코드 (예: "110", "201")
     * @param asOfDate    기준 일자 (이 날짜 포함 이전까지 누적)
     * @return 거래처별 차/대 합계 행
     */
    @Query("""
            SELECT l.partnerId AS partnerId,
                   l.accountCode AS accountCode,
                   COALESCE(SUM(l.debitAmount), 0) AS debitTotal,
                   COALESCE(SUM(l.creditAmount), 0) AS creditTotal
            FROM JournalLine l
            WHERE l.accountCode = :accountCode
              AND l.journal.journalDate <= :asOfDate
              AND l.journal.status = com.samhanair.logis.accounting.domain.JournalStatus.POSTED
              AND l.partnerId IS NOT NULL
            GROUP BY l.partnerId, l.accountCode
            """)
    List<PartnerAccountTotal> aggregateAgingByAccount(@Param("accountCode") String accountCode,
                                                      @Param("asOfDate") LocalDate asOfDate);

    /**
     * 거래처별 최초 미결 분개 일자 조회 — asOfDate 이전 POSTED 분개 라인 중 가장 이른 날짜.
     *
     * <p>잔액이 양수인 거래처의 oldestUnpaidDate 산출에 사용.
     * partnerId + accountCode 조합으로 조회하며, 1건씩 호출 (N+1 은 거래처 수가 수십~수백 수준).
     *
     * @param partnerId   거래처 UUID
     * @param accountCode 대상 계정 코드
     * @param asOfDate    기준 일자
     * @return 최초 분개 일자 목록 (첫 번째 항목 사용, 없으면 빈 목록)
     */
    @Query("""
            SELECT MIN(l.journal.journalDate)
            FROM JournalLine l
            WHERE l.partnerId = :partnerId
              AND l.accountCode = :accountCode
              AND l.journal.journalDate <= :asOfDate
              AND l.journal.status = com.samhanair.logis.accounting.domain.JournalStatus.POSTED
            """)
    java.util.Optional<LocalDate> findOldestJournalDate(@Param("partnerId") UUID partnerId,
                                                         @Param("accountCode") String accountCode,
                                                         @Param("asOfDate") LocalDate asOfDate);

    // ─── Slice C: 현금흐름표 / 자본변동표 / 일계표 / 월계표 ────────────────────────────

    /**
     * 현금흐름표용 — 기간 내 특정 계정 코드 목록에 대한 POSTED 분개 라인 집계.
     *
     * <p>accountCodes IN 조건으로 영업/투자/재무 활동 계정별 차/대 합계를 한 번에 조회한다.
     *
     * @param from         집계 시작 일자
     * @param to           집계 종료 일자
     * @param accountCodes 대상 계정 코드 목록
     * @return accountCode 별 차/대 합계 행
     */
    @Query("""
            SELECT l.accountCode AS accountCode,
                   COALESCE(SUM(l.debitAmount), 0) AS debitTotal,
                   COALESCE(SUM(l.creditAmount), 0) AS creditTotal
            FROM JournalLine l
            WHERE l.journal.journalDate >= :from
              AND l.journal.journalDate <= :to
              AND l.journal.status = com.samhanair.logis.accounting.domain.JournalStatus.POSTED
              AND l.accountCode IN :accountCodes
            GROUP BY l.accountCode
            """)
    List<AccountTotal> aggregatePostedByAccountCodes(@Param("from") LocalDate from,
                                                      @Param("to") LocalDate to,
                                                      @Param("accountCodes") List<String> accountCodes);

    /**
     * 일계표 / 월계표용 — 기간 내 POSTED 분개 건수.
     *
     * <p>동일 기간에 journalDate 가 속하는 POSTED Journal 의 고유 건수를 반환한다.
     *
     * @param from 집계 시작 일자
     * @param to   집계 종료 일자
     * @return POSTED 분개 건수
     */
    @Query("""
            SELECT COUNT(DISTINCT l.journal.id)
            FROM JournalLine l
            WHERE l.journal.journalDate >= :from
              AND l.journal.journalDate <= :to
              AND l.journal.status = com.samhanair.logis.accounting.domain.JournalStatus.POSTED
            """)
    long countPostedJournals(@Param("from") LocalDate from,
                             @Param("to") LocalDate to);

    /**
     * 월계표 일별 분해용 — 기간 내 POSTED 분개를 일자별로 차/대 합계 + 건수 집계.
     *
     * <p>반환 row: [journalDate, debitTotal, creditTotal, journalCount].
     * 일자 오름차순 정렬.
     *
     * @param from 집계 시작 일자
     * @param to   집계 종료 일자
     * @return 일자별 집계 행 목록
     */
    @Query("""
            SELECT l.journal.journalDate AS journalDate,
                   COALESCE(SUM(l.debitAmount), 0) AS debitTotal,
                   COALESCE(SUM(l.creditAmount), 0) AS creditTotal,
                   COUNT(DISTINCT l.journal.id) AS journalCount
            FROM JournalLine l
            WHERE l.journal.journalDate >= :from
              AND l.journal.journalDate <= :to
              AND l.journal.status = com.samhanair.logis.accounting.domain.JournalStatus.POSTED
            GROUP BY l.journal.journalDate
            ORDER BY l.journal.journalDate ASC
            """)
    List<DailyTotal> aggregateDailyTotals(@Param("from") LocalDate from,
                                          @Param("to") LocalDate to);

    /**
     * Spring Data JPA projection — 일자별 차/대 합계 + 건수.
     *
     * <p>월계표 dailyBreakdown 구성 시 사용.
     */
    interface DailyTotal {
        LocalDate getJournalDate();
        BigDecimal getDebitTotal();
        BigDecimal getCreditTotal();
        Long getJournalCount();
    }
}
