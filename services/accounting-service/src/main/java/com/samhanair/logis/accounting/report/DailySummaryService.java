package com.samhanair.logis.accounting.report;

import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.AccountTotal;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 일계표 (Daily Summary) 집계 Service.
 *
 * <p>특정 일자의 POSTED 분개 전체를 계정과목별 차/대/잔액 합계로 집계한다.
 *
 * <p>집계 규칙:
 * <ul>
 *   <li>POSTED+REVERSED(보상쌍 상쇄) 분개 라인 포함 (DRAFT 제외)</li>
 *   <li>대상 일자 = journalDate 기준 (귀속 회계 일자)</li>
 *   <li>balanced = |totalDebit - totalCredit| &lt; 0.01 원</li>
 *   <li>계정별 행은 ChartOfAccount displayOrder 오름차순 정렬</li>
 *   <li>분개 건수 = 해당 일자 POSTED Journal 의 고유 건수</li>
 *   <li>응답 필드명: date / accountSummary / DailyAccountLine (REPORTS-C-DESIGN.md §9 spec)</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class DailySummaryService {

    /** balanced 판정 허용 오차. */
    private static final BigDecimal BALANCE_TOLERANCE = new BigDecimal("0.01");

    private final JournalLineRepository journalLineRepository;
    private final ChartOfAccountRepository chartOfAccountRepository;

    /**
     * 특정 일자 일계표 조회.
     *
     * @param date 집계 대상 일자
     * @return 일계표 응답 DTO
     * @throws IllegalArgumentException date 가 null 인 경우
     */
    public DailySummaryResponse findByDate(LocalDate date) {
        if (date == null) {
            throw new IllegalArgumentException("date 는 필수입니다");
        }
        return buildReport(date, date);
    }

    /**
     * 일계표 집계 실행.
     *
     * @param from 집계 시작 일자
     * @param to   집계 종료 일자
     * @return 일계표 응답 DTO
     */
    DailySummaryResponse buildReport(LocalDate from, LocalDate to) {
        // 계정명 맵 (code → name) 및 정렬 순서 맵 (code → displayOrder)
        Map<String, String> nameMap = buildNameMap();
        Map<String, Integer> orderMap = buildOrderMap();

        // 계정별 차/대 합계 집계
        List<AccountTotal> totals = journalLineRepository.aggregatePostedByAccount(from, to);

        BigDecimal totalDebit = BigDecimal.ZERO;
        BigDecimal totalCredit = BigDecimal.ZERO;
        List<DailyAccountLine> accountLines = new ArrayList<>();

        for (AccountTotal t : totals) {
            String code = t.getAccountCode();
            BigDecimal debit = t.getDebitTotal();
            BigDecimal credit = t.getCreditTotal();
            BigDecimal balance = debit.subtract(credit); // debit - credit (양수 = 차변 초과)
            int sortOrder = orderMap.getOrDefault(code, Integer.MAX_VALUE);
            totalDebit = totalDebit.add(debit);
            totalCredit = totalCredit.add(credit);
            accountLines.add(new DailyAccountLine(
                    code,
                    nameMap.getOrDefault(code, code),
                    debit,
                    credit,
                    balance,
                    sortOrder));
        }

        // displayOrder 기준 정렬
        accountLines.sort(Comparator.comparingInt(DailyAccountLine::sortOrder));

        // 분개 건수
        long journalCount = journalLineRepository.countPostedJournals(from, to);

        // balanced 판정
        boolean balanced = totalDebit.subtract(totalCredit).abs()
                .compareTo(BALANCE_TOLERANCE) < 0;

        return new DailySummaryResponse(
                from,           // date = from (단일 날짜)
                journalCount,
                totalDebit,
                totalCredit,
                balanced,
                accountLines,   // accountSummary (spec 필드명)
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
