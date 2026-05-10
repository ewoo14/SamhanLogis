package com.samhanair.logis.accounting.report;

import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.AccountTotal;
import com.samhanair.logis.accounting.repository.JournalLineRepository.DailyTotal;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 월계표 (Monthly Summary) 집계 Service.
 *
 * <p>특정 월의 POSTED 분개 전체를 집계하며, 일별 소계 breakdown + 계정별 집계를 포함한다.
 *
 * <p>집계 규칙:
 * <ul>
 *   <li>POSTED 분개 라인만 포함 (DRAFT / REVERSED 제외)</li>
 *   <li>fromDate = 월 1일, toDate = 월 말일</li>
 *   <li>balanced = |totalDebit - totalCredit| &lt; 0.01 원</li>
 *   <li>dailyBreakdown: 일자 오름차순</li>
 *   <li>accountSummary: 계정별 차/대/잔액 집계 (DailyAccountLine, displayOrder 오름차순)</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MonthlySummaryService {

    private static final DateTimeFormatter PERIOD_FMT = DateTimeFormatter.ofPattern("yyyy-MM");
    private static final BigDecimal BALANCE_TOLERANCE = new BigDecimal("0.01");

    private final JournalLineRepository journalLineRepository;
    private final ChartOfAccountRepository chartOfAccountRepository;

    /**
     * 단월 월계표 조회.
     *
     * @param period 집계 월
     * @return 월계표 응답 DTO
     * @throws IllegalArgumentException period 가 null 인 경우
     */
    public MonthlySummaryResponse findByPeriod(YearMonth period) {
        if (period == null) {
            throw new IllegalArgumentException("period 는 필수입니다");
        }
        LocalDate from = period.atDay(1);
        LocalDate to   = period.atEndOfMonth();
        String label   = period.format(PERIOD_FMT);
        return buildReport(period, label, from, to);
    }

    /**
     * 월계표 집계 실행.
     *
     * @param period 집계 YearMonth
     * @param label  UI 표시용 기간 레이블
     * @param from   집계 시작 일자
     * @param to     집계 종료 일자
     * @return 월계표 응답 DTO
     */
    private MonthlySummaryResponse buildReport(
            YearMonth period, String label, LocalDate from, LocalDate to) {

        // ── 일별 소계 집계 ──────────────────────────────────────────
        List<DailyTotal> dailyTotals = journalLineRepository.aggregateDailyTotals(from, to);

        BigDecimal totalDebit  = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;
        long totalJournals     = 0L;

        for (DailyTotal dt : dailyTotals) {
            totalDebit  = totalDebit.add(dt.getDebitTotal());
            totalCredit = totalCredit.add(dt.getCreditTotal());
            totalJournals += dt.getJournalCount();
        }

        boolean balanced = totalDebit.subtract(totalCredit).abs()
                .compareTo(BALANCE_TOLERANCE) < 0;

        List<DailyBreakdownLine> breakdown = dailyTotals.stream()
                .map(dt -> new DailyBreakdownLine(
                        dt.getJournalDate(),
                        dt.getJournalCount(),
                        dt.getDebitTotal(),
                        dt.getCreditTotal()))
                .collect(Collectors.toList());

        // ── 계정별 집계 (accountSummary — DailyAccountLine 재사용) ──
        Map<String, String> nameMap = buildNameMap();
        Map<String, Integer> orderMap = buildOrderMap();

        List<AccountTotal> accountTotals = journalLineRepository.aggregatePostedByAccount(from, to);
        List<DailyAccountLine> accountSummary = new ArrayList<>();
        for (AccountTotal t : accountTotals) {
            String code = t.getAccountCode();
            BigDecimal debit = t.getDebitTotal();
            BigDecimal credit = t.getCreditTotal();
            BigDecimal balance = debit.subtract(credit);
            int sortOrder = orderMap.getOrDefault(code, Integer.MAX_VALUE);
            accountSummary.add(new DailyAccountLine(
                    code,
                    nameMap.getOrDefault(code, code),
                    debit,
                    credit,
                    balance,
                    sortOrder));
        }
        accountSummary.sort(Comparator.comparingInt(DailyAccountLine::sortOrder));

        return new MonthlySummaryResponse(
                label, period, from, to,
                totalJournals,
                totalDebit, totalCredit,
                balanced,
                breakdown,
                accountSummary,
                LocalDateTime.now()
        );
    }

    /**
     * 계정과목 코드 → 계정명 맵.
     *
     * @return code → name 맵
     */
    private Map<String, String> buildNameMap() {
        return chartOfAccountRepository.findAll().stream()
                .collect(Collectors.toMap(
                        a -> a.getCode(),
                        a -> a.getName(),
                        (a, b) -> a));
    }

    /**
     * 계정과목 코드 → displayOrder 맵.
     *
     * @return code → displayOrder 맵
     */
    private Map<String, Integer> buildOrderMap() {
        return chartOfAccountRepository.findAll().stream()
                .collect(Collectors.toMap(
                        a -> a.getCode(),
                        a -> a.getDisplayOrder(),
                        (a, b) -> a));
    }
}
