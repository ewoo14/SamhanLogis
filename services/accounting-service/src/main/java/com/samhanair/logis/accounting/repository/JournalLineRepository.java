package com.samhanair.logis.accounting.repository;

import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** JournalLine — 분개 라인. 시산표 집계용 native projection 제공. */
public interface JournalLineRepository extends JpaRepository<JournalLine, UUID> {

    /** Spring Data JPA projection — accountCode 별 차/대 합계. */
    interface AccountTotal {
        String getAccountCode();
        BigDecimal getDebitTotal();
        BigDecimal getCreditTotal();
    }

    /**
     * 마감/시산표 집계용 — accountCode 별 debit/credit 합계.
     * 본 슬라이스에서는 service 가 호출 후 prefix 그룹별로 합산. POSTED+REVERSED(보상쌍 상쇄) 포함.
     */
    @Query("""
            SELECT l.accountCode AS accountCode,
                   COALESCE(SUM(l.debitAmount), 0) AS debitTotal,
                   COALESCE(SUM(l.creditAmount), 0) AS creditTotal
            FROM JournalLine l
            WHERE l.journal.journalDate >= :from
              AND l.journal.journalDate <= :to
              AND l.journal.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
            GROUP BY l.accountCode
            """)
    List<AccountTotal> aggregatePostedByAccount(@Param("from") LocalDate from,
                                                @Param("to") LocalDate to);

    /**
     * 거래처 + 계정코드 별 차/대 합계 — PR-E2 BE-A8 매출/수금/채권 집계용.
     *
     * <p>POSTED+REVERSED(보상쌍 상쇄) 분개 라인을 집계. {@code partnerId} 가 NULL 인 라인은 제외 (집계 대상이 아님).
     * CASH_RECEIPT 원천을 다른 원천과 분리해 반환한다. 원장 화면의 수금 정본은
     * {@code cash_receipts.amount}이므로 service가 CASH_RECEIPT 분개를 이중 집계하지 않는다.
     * 응답 row 는 [partnerId, accountCode, sourceType, debitTotal, creditTotal].
     */
    @Query("""
            SELECT l.partnerId AS partnerId,
                   l.accountCode AS accountCode,
                   l.journal.sourceType AS sourceType,
                   COALESCE(SUM(l.debitAmount), 0) AS debitTotal,
                   COALESCE(SUM(l.creditAmount), 0) AS creditTotal
            FROM JournalLine l
            WHERE l.journal.journalDate >= :from
              AND l.journal.journalDate <= :to
              AND l.journal.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
              AND l.partnerId IS NOT NULL
            GROUP BY l.partnerId, l.accountCode, l.journal.sourceType
            """)
    List<PartnerAccountTotal> aggregatePostedByPartnerAccount(@Param("from") LocalDate from,
                                                              @Param("to") LocalDate to);

    /** Partner ledger canonical aggregate: only currently POSTED journal lines are authoritative. */
    @Query("""
            SELECT l.partnerId AS partnerId,
                   l.accountCode AS accountCode,
                   l.journal.sourceType AS sourceType,
                   COALESCE(SUM(l.debitAmount), 0) AS debitTotal,
                   COALESCE(SUM(l.creditAmount), 0) AS creditTotal
            FROM JournalLine l
            WHERE l.journal.journalDate >= :from
              AND l.journal.journalDate <= :to
              AND l.journal.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED)
              AND l.partnerId IS NOT NULL
            GROUP BY l.partnerId, l.accountCode, l.journal.sourceType
            """)
    List<PartnerAccountTotal> aggregatePostedOnlyByPartnerAccount(@Param("from") LocalDate from,
                                                                   @Param("to") LocalDate to);

    /** Spring Data JPA projection — 거래처 + 계정코드 별 차/대 합계. */
    interface PartnerAccountTotal {
        UUID getPartnerId();
        String getAccountCode();
        JournalSourceType getSourceType();
        BigDecimal getDebitTotal();
        BigDecimal getCreditTotal();
    }

    /**
     * 거래처별 110(외상매출금) 누적 잔액 — A9 원장 데이터의 잔액 컬럼용.
     *
     * <p>POSTED+REVERSED(보상쌍 상쇄) 분개 라인을 합산한다. 보상분개 모델에서는 원분개(REVERSED)와
     * 신규 역분개(POSTED)를 함께 읽어야 잔액 = SUM(debit) - SUM(credit)이 정확히 상쇄된다.
     * caller 가 partnerId 별로 호출하거나 batch 로 partnerId IN (..) 을 사용.
     */
    @Query("""
            SELECT l FROM JournalLine l
            WHERE l.partnerId = :partnerId
              AND l.accountCode = :accountCode
              AND l.journal.journalDate <= :asOf
              AND l.journal.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
            ORDER BY l.journal.journalDate ASC, l.journal.journalNo ASC, l.lineNo ASC
            """)
    List<JournalLine> findLinesUpTo(@Param("partnerId") UUID partnerId,
                                    @Param("accountCode") String accountCode,
                                    @Param("asOf") LocalDate asOf);

    /**
     * 거래처별 기간 분개 라인 — A9 원장 데이터 (전 계정 통합). POSTED+REVERSED(보상쌍 상쇄) 보상분개 포함.
     */
    @Query("""
            SELECT l FROM JournalLine l
            WHERE l.partnerId = :partnerId
              AND l.journal.journalDate >= :from
              AND l.journal.journalDate <= :to
              AND l.journal.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
            ORDER BY l.journal.journalDate ASC, l.journal.journalNo ASC, l.lineNo ASC
            """)
    List<JournalLine> findPartnerLinesInRange(@Param("partnerId") UUID partnerId,
                                              @Param("from") LocalDate from,
                                              @Param("to") LocalDate to);

    /**
     * 거래처가 연결된 전표의 전체 라인 — 원장 collection contract 입력용.
     *
     * <p>거래처 ID는 채권 라인에만 연결될 수 있으므로, 거래처 라인만 읽으면
     * 매출 대변과 역분개 차변이 잘려 REVERSED 원분개와 POSTED 역분개의
     * 상쇄가 불가능해진다. 거래처 라인이 하나라도 있는 전표의 모든 라인을
     * 읽어야 업무 효과(SALE/PAYMENT/NONE)를 전표 단위로 분류할 수 있다.</p>
     */
    @Query("""
            SELECT l FROM JournalLine l
            WHERE l.journal.journalDate >= :from
              AND l.journal.journalDate <= :to
              AND l.journal.status =
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED
              AND EXISTS (
                    SELECT linked.id FROM JournalLine linked
                    WHERE linked.journal.id = l.journal.id
                      AND linked.partnerId = :partnerId)
            ORDER BY l.journal.journalDate ASC, l.journal.journalNo ASC, l.lineNo ASC
            """)
    List<JournalLine> findJournalLinesInRangeForPartner(@Param("partnerId") UUID partnerId,
                                                        @Param("from") LocalDate from,
                                                        @Param("to") LocalDate to);

    /** 거래처가 연결된 전표의 기준일 포함 전체 라인 — 기간과 동일한 collection contract 입력용. */
    @Query("""
            SELECT l FROM JournalLine l
            WHERE l.journal.journalDate <= :asOf
              AND l.journal.status =
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED
              AND EXISTS (
                    SELECT linked.id FROM JournalLine linked
                    WHERE linked.journal.id = l.journal.id
                      AND linked.partnerId = :partnerId)
            ORDER BY l.journal.journalDate ASC, l.journal.journalNo ASC, l.lineNo ASC
            """)
    List<JournalLine> findJournalLinesUpToForPartner(@Param("partnerId") UUID partnerId,
                                                     @Param("asOf") LocalDate asOf);

    /**
     * 재무상태표 집계용 — asOfDate 이전 누적 POSTED+REVERSED(보상쌍 상쇄) 분개 라인의 accountCode 별 차/대 합계.
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
              AND l.journal.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
            GROUP BY l.accountCode
            """)
    List<AccountTotal> aggregatePostedUpTo(@Param("asOfDate") LocalDate asOfDate);

    /**
     * 거래처별 미수/미지급금 집계 — asOfDate 이전 누적 POSTED+REVERSED(보상쌍 상쇄) 분개 라인.
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
              AND l.journal.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
              AND l.partnerId IS NOT NULL
            GROUP BY l.partnerId, l.accountCode
            """)
    List<PartnerAccountTotal> aggregateAgingByAccount(@Param("accountCode") String accountCode,
                                                      @Param("asOfDate") LocalDate asOfDate);

    /**
     * 채권채무 현황 월별 aging 산출용 — 계정+거래처+분개일자별 차/대 합계.
     *
     * <p>POSTED+REVERSED(보상쌍 상쇄)를 함께 읽어 취소/수정 보상분개 net을 상쇄한다.
     * 컬렉션 JOIN FETCH 없이 GROUP BY 만 사용한다. service 레이어는 일자순 movement 를
     * FIFO 로 상계하여 남은 미수/미지급 잔액을 발생월 버킷에 배분한다.
     *
     * @param accountCodes 채권/채무 대상 계정코드
     * @param asOfDate 기준일
     * @return 계정+거래처+분개일자별 movement 집계
     */
    @Query("""
            SELECT l.partnerId AS partnerId,
                   l.accountCode AS accountCode,
                   l.journal.journalDate AS journalDate,
                   COALESCE(SUM(l.debitAmount), 0) AS debitTotal,
                   COALESCE(SUM(l.creditAmount), 0) AS creditTotal
            FROM JournalLine l
            WHERE l.accountCode IN :accountCodes
              AND l.journal.journalDate <= :asOfDate
              AND l.journal.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
              AND l.partnerId IS NOT NULL
            GROUP BY l.partnerId, l.accountCode, l.journal.journalDate
            ORDER BY l.partnerId ASC, l.accountCode ASC, l.journal.journalDate ASC
            """)
    List<PartnerAccountMovement> aggregateAgingMovementsByAccounts(
            @Param("accountCodes") List<String> accountCodes,
            @Param("asOfDate") LocalDate asOfDate);

    /** Spring Data JPA projection — 계정+거래처+분개일자별 차/대 합계. */
    interface PartnerAccountMovement {
        UUID getPartnerId();
        String getAccountCode();
        LocalDate getJournalDate();
        BigDecimal getDebitTotal();
        BigDecimal getCreditTotal();
    }

    /**
     * 자금현황 기간 집계 — FUND 계정 목록의 계정코드 + partnerId 별 차/대 합계.
     *
     * <p>POSTED+REVERSED(보상쌍 상쇄) 분개를 포함한다. partnerId 가 NULL 인 라인도 "기타" 표시 대상이므로 제외하지 않는다.
     *
     * @param accountCodes 자금 계정코드 목록
     * @param from 조회 시작일
     * @param to 조회 종료일
     * @return 계정코드 + partnerId 별 차/대 합계
     */
    @Query("""
            SELECT l.partnerId AS partnerId,
                   l.accountCode AS accountCode,
                   COALESCE(SUM(l.debitAmount), 0) AS debitTotal,
                   COALESCE(SUM(l.creditAmount), 0) AS creditTotal
            FROM JournalLine l
            WHERE l.accountCode IN :accountCodes
              AND l.journal.journalDate >= :from
              AND l.journal.journalDate <= :to
              AND l.journal.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
            GROUP BY l.partnerId, l.accountCode
            """)
    List<PartnerAccountTotal> aggregateFundsByAccountPartner(@Param("accountCodes") List<String> accountCodes,
                                                             @Param("from") LocalDate from,
                                                             @Param("to") LocalDate to);

    /**
     * 자금현황 이월 집계 — 기준일 포함 이전까지 FUND 계정 목록의 계정코드 + partnerId 별 차/대 누계.
     *
     * <p>이월잔액은 caller 가 계정 category 별 잔액 부호로 변환한다.
     * POSTED+REVERSED(보상쌍 상쇄)를 함께 읽어 보상분개 net을 정확히 상쇄한다.
     *
     * @param accountCodes 자금 계정코드 목록
     * @param asOfDate 이월 기준일
     * @return 계정코드 + partnerId 별 차/대 누계
     */
    @Query("""
            SELECT l.partnerId AS partnerId,
                   l.accountCode AS accountCode,
                   COALESCE(SUM(l.debitAmount), 0) AS debitTotal,
                   COALESCE(SUM(l.creditAmount), 0) AS creditTotal
            FROM JournalLine l
            WHERE l.accountCode IN :accountCodes
              AND l.journal.journalDate <= :asOfDate
              AND l.journal.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
            GROUP BY l.partnerId, l.accountCode
            """)
    List<PartnerAccountTotal> aggregateFundsOpeningByAccountPartner(@Param("accountCodes") List<String> accountCodes,
                                                                    @Param("asOfDate") LocalDate asOfDate);

    /**
     * 계정명세서 스냅샷 — 기준일 포함 이전까지 대상 계정의 계정코드 + partnerId 별 차/대 누계.
     *
     * <p>POSTED+REVERSED(보상쌍 상쇄) 분개를 포함한다. partnerId 가 NULL 인 라인은 service 레이어에서 "기타"로
     * 표시한다. 컬렉션 JOIN FETCH 없이 GROUP BY 집계만 사용하여 다중 라인 전표의
     * 카르테시안 증폭을 방지한다.
     *
     * @param accountCodes 대상 계정코드 목록
     * @param asOfDate 기준일
     * @return 계정코드 + partnerId 별 차/대 누계
     */
    @Query("""
            SELECT l.partnerId AS partnerId,
                   l.accountCode AS accountCode,
                   COALESCE(SUM(l.debitAmount), 0) AS debitTotal,
                   COALESCE(SUM(l.creditAmount), 0) AS creditTotal
            FROM JournalLine l
            WHERE l.accountCode IN :accountCodes
              AND l.journal.journalDate <= :asOfDate
              AND l.journal.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
            GROUP BY l.partnerId, l.accountCode
            """)
    List<PartnerAccountTotal> aggregateAccountStatementByAccountPartner(@Param("accountCodes") List<String> accountCodes,
                                                                        @Param("asOfDate") LocalDate asOfDate);

    /**
     * 자금 증가 drill-down 대상 라인 조회.
     *
     * <p>증가/감소 방향 판정은 계정 category 가 필요하므로 service 에서 수행한다.
     * 같은 전표의 상대 라인은 {@code line.getJournal().getLines()} 로 조회한다.
     *
     * @param accountCode 자금 계정코드
     * @param partnerId 거래처 UUID 필터. null 이면 전체 거래처
     * @param from 조회 시작일
     * @param to 조회 종료일
     * @return 기간 내 POSTED+REVERSED(보상쌍 상쇄) 대상 계정 라인
     */
    @Query("""
            SELECT l FROM JournalLine l
            JOIN FETCH l.journal j
            WHERE l.accountCode = :accountCode
              AND (:partnerId IS NULL OR l.partnerId = :partnerId)
              AND j.journalDate >= :from
              AND j.journalDate <= :to
              AND j.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
            ORDER BY j.journalDate ASC, j.journalNo ASC, l.lineNo ASC
            """)
    List<JournalLine> findFundsDetailLines(@Param("accountCode") String accountCode,
                                           @Param("partnerId") UUID partnerId,
                                           @Param("from") LocalDate from,
                                           @Param("to") LocalDate to);

    /**
     * 자금 입출금내역 보고서용 현금성 계정 라인 조회.
     *
     * <p>기간 내 POSTED+REVERSED(보상쌍 상쇄) 분개 중 현금성 계정(현금/보통예금 등)에 닿은 라인을 조회하고,
     * 같은 전표의 상대 라인까지 fetch join 하여 service 레이어에서 상대계정별 증가/감소를 분해한다.
     *
     * @param accountCodes 현금성 계정코드 목록
     * @param from 조회 시작일
     * @param to 조회 종료일
     * @return 기간 내 POSTED+REVERSED(보상쌍 상쇄) 현금성 계정 라인
     */
    @Query("""
            SELECT DISTINCT l FROM JournalLine l
            JOIN FETCH l.journal j
            LEFT JOIN FETCH j.lines jl
            WHERE l.accountCode IN :accountCodes
              AND j.journalDate >= :from
              AND j.journalDate <= :to
              AND j.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
            ORDER BY j.journalDate ASC, j.journalNo ASC, l.lineNo ASC
            """)
    List<JournalLine> findPostedCashEquivalentLines(@Param("accountCodes") List<String> accountCodes,
                                                    @Param("from") LocalDate from,
                                                    @Param("to") LocalDate to);

    /**
     * 거래처별 최초 분개 일자 조회 — asOfDate 이전 POSTED+REVERSED(보상쌍 상쇄) 분개 라인 중 가장 이른 날짜.
     *
     * <p>잔액이 양수인 거래처의 oldestUnpaidDate 산출에 사용한다. 보상분개는 원분개와 같은 일자에
     * 신규 반대 분개를 더하는 모델이므로 MIN(journalDate)는 원 발생일 기준으로 유지된다.
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
              AND l.journal.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
            """)
    java.util.Optional<LocalDate> findOldestJournalDate(@Param("partnerId") UUID partnerId,
                                                         @Param("accountCode") String accountCode,
                                                         @Param("asOfDate") LocalDate asOfDate);

    // ─── Slice C: 현금흐름표 / 자본변동표 / 일계표 / 월계표 ────────────────────────────

    /**
     * 현금흐름표용 — 기간 내 특정 계정 코드 목록에 대한 POSTED+REVERSED(보상쌍 상쇄) 분개 라인 집계.
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
              AND l.journal.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
              AND l.accountCode IN :accountCodes
            GROUP BY l.accountCode
            """)
    List<AccountTotal> aggregatePostedByAccountCodes(@Param("from") LocalDate from,
                                                      @Param("to") LocalDate to,
                                                      @Param("accountCodes") List<String> accountCodes);

    /**
     * 일계표 / 월계표용 — 기간 내 POSTED+REVERSED(보상쌍 상쇄) 분개 건수.
     *
     * <p>동일 기간에 journalDate 가 속하는 POSTED+REVERSED(보상쌍 상쇄) Journal 의 고유 건수를 반환한다.
     *
     * @param from 집계 시작 일자
     * @param to   집계 종료 일자
     * @return POSTED+REVERSED(보상쌍 상쇄) 분개 건수
     */
    @Query("""
            SELECT COUNT(DISTINCT l.journal.id)
            FROM JournalLine l
            WHERE l.journal.journalDate >= :from
              AND l.journal.journalDate <= :to
              AND l.journal.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
            """)
    long countPostedJournals(@Param("from") LocalDate from,
                             @Param("to") LocalDate to);

    /**
     * 월계표 일별 분해용 — 기간 내 POSTED+REVERSED(보상쌍 상쇄) 분개를 일자별로 차/대 합계 + 건수 집계.
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
              AND l.journal.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
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

    // ─── SP-08-6-5: 원장 전체 조회 ──────────────────────────────────────────

    /**
     * 기간 내 전체 거래처 POSTED+REVERSED(보상쌍 상쇄) 분개 라인 조회 — 원장 전체 뷰 (SP-08-6-5).
     *
     * <p>partnerCode 필터 없는 원장 조회 시 사용. 일자 + 분개번호 + 라인번호 순 정렬.
     *
     * @param from 조회 시작 날짜
     * @param to   조회 종료 날짜
     * @return POSTED+REVERSED(보상쌍 상쇄) 분개 라인 목록
     */
    @Query("""
            SELECT l FROM JournalLine l
            WHERE l.journal.journalDate >= :from
              AND l.journal.journalDate <= :to
              AND l.journal.status IN (
                    com.samhanair.logis.accounting.domain.JournalStatus.POSTED,
                    com.samhanair.logis.accounting.domain.JournalStatus.REVERSED)
            ORDER BY l.journal.journalDate ASC, l.journal.journalNo ASC, l.lineNo ASC
            """)
    List<JournalLine> findAllPostedLinesInRange(@Param("from") LocalDate from,
                                                @Param("to") LocalDate to);
}
