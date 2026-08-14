package com.samhanair.logis.accounting.report;

import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.AccountTotal;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 자본변동표 (Statement of Changes in Equity) 집계 Service.
 *
 * <p>응답 구조: REPORTS-C-DESIGN.md §9 Props spec — flat 필드 구조.
 *
 * <p>자본 구성 항목 (V1 chart_of_accounts 기준):
 * <ul>
 *   <li>3329 자본금 — 증자(credit)/감자(debit) 반영</li>
 *   <li>343 미처분이익잉여금 — 당기순이익 + 배당 반영</li>
 * </ul>
 *
 * <p>기초 잔액 = fromDate 전날(beforeFrom)까지의 POSTED+REVERSED(보상쌍 상쇄) 분개 누적 잔액.
 * 기말 잔액 = toDate 까지의 POSTED+REVERSED(보상쌍 상쇄) 분개 누적 잔액.
 *
 * <p>당기순이익 계산: 손익계산서 Service (동일 패키지 package-private 메서드) 호출.
 * 배당 = 343 계정에서 debit 분개(이익잉여금 차감 분개) 합계.
 * POSTED+REVERSED(보상쌍 상쇄) 분개를 집계.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class EquityChangesService {

    /** 자본금 계정 코드 (V101 이카운트 정본: 3329). */
    private static final String CAPITAL_STOCK_CODE = "3329";

    /** 미처분이익잉여금 계정 코드. */
    private static final String RETAINED_EARNINGS_CODE = "3779";

    private final JournalLineRepository journalLineRepository;
    private final IncomeStatementService incomeStatementService;

    /**
     * 기간 자본변동표 조회.
     *
     * @param fromDate 기간 시작 일자
     * @param toDate   기간 종료 일자
     * @return 자본변동표 응답 DTO (flat 구조)
     * @throws IllegalArgumentException fromDate &gt; toDate 인 경우
     */
    public EquityChangesResponse findByDateRange(LocalDate fromDate, LocalDate toDate) {
        if (fromDate == null) {
            throw new IllegalArgumentException("fromDate 는 필수입니다");
        }
        if (toDate == null) {
            throw new IllegalArgumentException("toDate 는 필수입니다");
        }
        if (fromDate.isAfter(toDate)) {
            throw new IllegalArgumentException(
                    "fromDate(" + fromDate + ") 는 toDate(" + toDate + ") 보다 이전이어야 합니다");
        }

        // ── 기초 잔액 (fromDate 전날까지 누적) ────────────────────────────────
        LocalDate beforeFrom = fromDate.minusDays(1);
        BigDecimal beginningCapitalStock = calcEquityBalance(CAPITAL_STOCK_CODE, beforeFrom);
        BigDecimal beginningRetainedEarnings = calcRetainedEarnings(beforeFrom);
        BigDecimal beginningTotalEquity = beginningCapitalStock.add(beginningRetainedEarnings);

        // ── 기간 중 변동 집계 ──────────────────────────────────────────────────
        List<AccountTotal> periodTotals = journalLineRepository.aggregatePostedByAccountCodes(
                fromDate, toDate,
                List.of(CAPITAL_STOCK_CODE, RETAINED_EARNINGS_CODE));

        Map<String, AccountTotal> periodMap = periodTotals.stream()
                .collect(Collectors.toMap(AccountTotal::getAccountCode, t -> t));

        // 자본금 증자 = credit 합계, 감자 = debit 합계 (음수 표시)
        AccountTotal capitalPeriod = periodMap.get(CAPITAL_STOCK_CODE);
        BigDecimal capitalStockIncrease = capitalPeriod != null
                ? capitalPeriod.getCreditTotal() : BigDecimal.ZERO;
        BigDecimal capitalStockDecrease = capitalPeriod != null
                ? capitalPeriod.getDebitTotal().negate() : BigDecimal.ZERO; // 음수

        // 당기순이익 (손익계산서 service 동일 패키지 호출)
        String periodLabel = fromDate + " ~ " + toDate;
        IncomeStatementResponse is = incomeStatementService.buildReport(fromDate, toDate, periodLabel);
        BigDecimal netIncome = is.netIncome();

        // 배당 = 343 계정 debit 분개 합계 (음수 — 이익잉여금 감소)
        AccountTotal retainedPeriod = periodMap.get(RETAINED_EARNINGS_CODE);
        BigDecimal dividends = retainedPeriod != null
                ? retainedPeriod.getDebitTotal().negate() : BigDecimal.ZERO; // 음수

        // ── 기말 잔액 산출 ─────────────────────────────────────────────────────
        BigDecimal endingCapitalStock = beginningCapitalStock
                .add(capitalStockIncrease)
                .add(capitalStockDecrease);
        BigDecimal endingRetainedEarnings = beginningRetainedEarnings
                .add(netIncome)
                .add(dividends);
        BigDecimal endingTotalEquity = endingCapitalStock.add(endingRetainedEarnings);
        BigDecimal totalChange = endingTotalEquity.subtract(beginningTotalEquity);

        return new EquityChangesResponse(
                periodLabel,
                fromDate,
                toDate,
                beginningCapitalStock,
                capitalStockIncrease,
                capitalStockDecrease,
                endingCapitalStock,
                beginningRetainedEarnings,
                netIncome,
                dividends,
                endingRetainedEarnings,
                beginningTotalEquity,
                endingTotalEquity,
                totalChange,
                LocalDateTime.now()
        );
    }

    /**
     * 특정 계정 코드의 특정 일자 이전 누적 잔액 (credit - debit, 자본 계정 기준).
     *
     * @param accountCode 계정 코드
     * @param asOfDate    기준 일자 (해당 날짜 포함 이전 누적)
     * @return 자본 잔액 (credit - debit)
     */
    private BigDecimal calcEquityBalance(String accountCode, LocalDate asOfDate) {
        if (asOfDate.isBefore(LocalDate.of(2000, 1, 1))) {
            return BigDecimal.ZERO;
        }
        List<AccountTotal> totals = journalLineRepository.aggregatePostedByAccountCodes(
                LocalDate.of(2000, 1, 1), asOfDate, List.of(accountCode));
        return totals.stream()
                .map(t -> t.getCreditTotal().subtract(t.getDebitTotal()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /**
     * 이익잉여금 누적 잔액 산출.
     *
     * <p>343 미처분이익잉여금 분개 잔액(credit - debit)에 손익계산서 누적 당기순이익을 가산한다.
     * BalanceSheetService 의 plNetEffect 방식과 동일하게 P&L 계정 누적 순이익을 반영.
     *
     * @param asOfDate 기준 일자
     * @return 이익잉여금 잔액
     */
    private BigDecimal calcRetainedEarnings(LocalDate asOfDate) {
        if (asOfDate.isBefore(LocalDate.of(2000, 1, 1))) {
            return BigDecimal.ZERO;
        }
        // 343 계정 직접 분개 잔액
        BigDecimal retainedBase = calcEquityBalance(RETAINED_EARNINGS_CODE, asOfDate);

        // P&L 계정 누적 순이익 (손익계산서 전체 누적)
        IncomeStatementResponse is = incomeStatementService.buildReport(
                LocalDate.of(2000, 1, 1), asOfDate, "누적");
        return retainedBase.add(is.netIncome());
    }
}
