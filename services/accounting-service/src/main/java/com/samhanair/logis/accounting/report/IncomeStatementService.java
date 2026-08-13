package com.samhanair.logis.accounting.report;

import com.samhanair.logis.accounting.domain.AccountCategory;
import com.samhanair.logis.accounting.domain.ChartOfAccount;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.AccountTotal;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 손익계산서 (Income Statement) 집계 Service.
 *
 * <p>집계 대상: POSTED+REVERSED(보상쌍 상쇄) 분개 (DRAFT 제외).
 *
 * <p>금액 부호 규약:
 * <ul>
 *   <li>매출 (400~)       = credit - debit (대변 잔액)</li>
 *   <li>매출원가 (500~)    = debit - credit (차변 잔액)</li>
 *   <li>판관비 (800~)      = debit - credit (차변 잔액)</li>
 *   <li>영업외수익 (901~906 등) = credit - debit (대변 잔액)</li>
 *   <li>영업외비용 (951~970 등) = debit - credit (차변 잔액)</li>
 *   <li>법인세비용 (991)   = debit - credit (차변 잔액)</li>
 * </ul>
 *
 * <p>NON_OPERATING 계정은 통합하여 totalNonOperating 에 반영한다.
 * 수익성 계정(credit 잔액)은 양수, 비용성 계정(debit 잔액)은 음수로 처리한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class IncomeStatementService {

    /** V101 이카운트 정본 법인세등 계정. */
    private static final String INCOME_TAX_CODE = "9719";

    private final JournalLineRepository journalLineRepository;
    private final ChartOfAccountRepository chartOfAccountRepository;

    /**
     * 단월 손익계산서 조회.
     *
     * @param period 회계 월 (yyyyMM)
     * @return 손익계산서 응답 DTO
     */
    public IncomeStatementResponse findByPeriod(YearMonth period) {
        LocalDate from = period.atDay(1);
        LocalDate to = period.atEndOfMonth();
        String periodLabel = period.getYear() + "-" + String.format("%02d", period.getMonthValue());
        return buildReport(from, to, periodLabel);
    }

    /**
     * 기간 손익계산서 조회.
     *
     * @param from 시작 월 (yyyyMM)
     * @param to   종료 월 (yyyyMM)
     * @return 손익계산서 응답 DTO
     * @throws IllegalArgumentException from &gt; to 인 경우
     */
    public IncomeStatementResponse findByPeriodRange(YearMonth from, YearMonth to) {
        if (from.isAfter(to)) {
            throw new IllegalArgumentException(
                    "fromPeriod(" + from + ") 은 toPeriod(" + to + ") 보다 이전이어야 합니다");
        }
        LocalDate fromDate = from.atDay(1);
        LocalDate toDate = to.atEndOfMonth();
        String fromLabel = from.getYear() + "-" + String.format("%02d", from.getMonthValue());
        String toLabel = to.getYear() + "-" + String.format("%02d", to.getMonthValue());
        String periodLabel = fromLabel.equals(toLabel) ? fromLabel : fromLabel + " ~ " + toLabel;
        return buildReport(fromDate, toDate, periodLabel);
    }

    /**
     * 실제 집계 로직 — 패키지 내부 공유 (현금흐름표 service 등 동일 패키지 호출용).
     *
     * @param from        시작 일자
     * @param to          종료 일자
     * @param periodLabel UI 표시용 기간 문자열
     * @return 손익계산서 응답 DTO
     */
    IncomeStatementResponse buildReport(LocalDate from, LocalDate to, String periodLabel) {
        List<AccountTotal> totals = journalLineRepository.aggregatePostedByAccount(from, to);
        Map<String, ChartOfAccount> accountMap = buildAccountMap();

        // 카테고리별 집계 맵 (accountCode -> amount)
        Map<String, BigDecimal> amountByCode = new HashMap<>();
        for (AccountTotal t : totals) {
            String code = t.getAccountCode();
            ChartOfAccount account = accountMap.get(code);
            if (account == null) {
                continue;
            }
            BigDecimal amount = INCOME_TAX_CODE.equals(code)
                    ? t.getDebitTotal().subtract(t.getCreditTotal())
                    : computeSignedAmount(account.getCategory(), t.getDebitTotal(), t.getCreditTotal());
            amountByCode.put(code, amount);
        }

        // 카테고리별 행 목록 구성 (통제 계정 제외 = isLeaf만)
        List<IncomeStatementLine> revenue = buildLines(AccountCategory.REVENUE, amountByCode, accountMap);
        List<IncomeStatementLine> costOfSales = buildLines(AccountCategory.COST_OF_SALES, amountByCode, accountMap);
        List<IncomeStatementLine> sga = buildLines(AccountCategory.SGA, amountByCode, accountMap);
        List<IncomeStatementLine> nonOperating = buildNonOperatingLines(amountByCode, accountMap);

        // 소계 산출
        BigDecimal totalRevenue = sumAmounts(revenue);
        BigDecimal totalCostOfSales = sumAmounts(costOfSales);
        BigDecimal grossProfit = totalRevenue.subtract(totalCostOfSales);
        BigDecimal totalSga = sumAmounts(sga);
        BigDecimal operatingProfit = grossProfit.subtract(totalSga);
        BigDecimal totalNonOperating = sumAmounts(nonOperating);
        BigDecimal incomeBeforeTax = operatingProfit.add(totalNonOperating);

        // 법인세비용 (991) 별도 분리
        BigDecimal incomeTax = amountByCode.getOrDefault(INCOME_TAX_CODE, BigDecimal.ZERO);
        BigDecimal netIncome = incomeBeforeTax.subtract(incomeTax);

        return new IncomeStatementResponse(
                periodLabel,
                from,
                to,
                revenue,
                totalRevenue,
                costOfSales,
                totalCostOfSales,
                grossProfit,
                sga,
                totalSga,
                operatingProfit,
                nonOperating,
                totalNonOperating,
                incomeBeforeTax,
                incomeTax,
                netIncome,
                LocalDateTime.now()
        );
    }

    /**
     * 계정과목 전체 맵 구성 (code → ChartOfAccount).
     */
    private Map<String, ChartOfAccount> buildAccountMap() {
        Map<String, ChartOfAccount> map = new HashMap<>();
        chartOfAccountRepository.findAll().forEach(a -> map.put(a.getCode(), a));
        return map;
    }

    /**
     * 카테고리별 손익 행 목록 구성 (법인세비용 제외).
     *
     * @param category   대상 카테고리
     * @param amountMap  계정코드별 금액 맵
     * @param accountMap 계정과목 마스터 맵
     * @return 정렬된 IncomeStatementLine 목록
     */
    private List<IncomeStatementLine> buildLines(
            AccountCategory category,
            Map<String, BigDecimal> amountMap,
            Map<String, ChartOfAccount> accountMap) {
        return accountMap.values().stream()
                .filter(a -> a.getCategory() == category && a.isLeaf())
                .filter(a -> amountMap.containsKey(a.getCode()))
                .map(a -> new IncomeStatementLine(
                        a.getCode(),
                        a.getName(),
                        category.name(),
                        amountMap.get(a.getCode()),
                        a.getDisplayOrder()))
                .sorted(Comparator.comparingInt(IncomeStatementLine::sortOrder))
                .toList();
    }

    /**
     * 영업외손익 행 목록 구성.
     *
     * <p>NON_OPERATING 카테고리 계정 중 INCOME_TAX 코드("991")는 제외.
     * 영업외수익 계정은 credit 잔액 양수(플러스), 영업외비용은 debit 잔액 음수(마이너스) 표시.
     *
     * @param amountMap  계정코드별 금액 맵
     * @param accountMap 계정과목 마스터 맵
     * @return 정렬된 IncomeStatementLine 목록
     */
    private List<IncomeStatementLine> buildNonOperatingLines(
            Map<String, BigDecimal> amountMap,
            Map<String, ChartOfAccount> accountMap) {
        return accountMap.values().stream()
                .filter(a -> a.getCategory() == AccountCategory.NON_OPERATING && a.isLeaf())
                .filter(a -> !INCOME_TAX_CODE.equals(a.getCode()))
                .filter(a -> amountMap.containsKey(a.getCode()))
                .map(a -> new IncomeStatementLine(
                        a.getCode(),
                        a.getName(),
                        AccountCategory.NON_OPERATING.name(),
                        amountMap.get(a.getCode()),
                        a.getDisplayOrder()))
                .sorted(Comparator.comparingInt(IncomeStatementLine::sortOrder))
                .toList();
    }

    /**
     * 카테고리별 부호 적용 금액 계산.
     *
     * <p>매출 / 영업외손익 = credit - debit (대변 잔액 양수).
     * 매출원가 / 판관비 = debit - credit (차변 잔액 양수).
     * 법인세 = debit - credit (차변 잔액).
     *
     * @param category  계정 카테고리
     * @param debit     차변 합계
     * @param credit    대변 합계
     * @return 부호 적용된 금액
     */
    private BigDecimal computeSignedAmount(AccountCategory category,
                                           BigDecimal debit,
                                           BigDecimal credit) {
        return switch (category) {
            case REVENUE, NON_OPERATING -> credit.subtract(debit);
            case COST_OF_SALES, SGA, INCOME_TAX -> debit.subtract(credit);
            default -> BigDecimal.ZERO; // ASSET / LIABILITY / EQUITY 는 P&L 미해당
        };
    }

    /**
     * 행 목록의 amount 합계.
     *
     * @param lines 손익계산서 행 목록
     * @return 합계 금액
     */
    private BigDecimal sumAmounts(List<IncomeStatementLine> lines) {
        return lines.stream()
                .map(IncomeStatementLine::amount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
