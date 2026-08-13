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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 월별손익분석 집계 서비스.
 *
 * <p>읽기 전용 보고서이며 POSTED+REVERSED(보상쌍 상쇄) 분개 라인을 계정코드별 GROUP BY 로 집계한다.
 * 월별 분해는 1월~12월 기간을 순회하며 기존 계정별 집계 쿼리를 반복 호출한다.
 * 컬렉션 JOIN FETCH 를 사용하지 않아 분개 라인 중복/카르테시안 증폭 위험을 피한다.
 *
 * <p>손익 부호 규칙:
 * <ul>
 *   <li>매출 = 대변 - 차변</li>
 *   <li>매출원가 / 판관비 / 법인세 = 차변 - 대변</li>
 *   <li>영업외손익 = 대변 - 차변. 비용 계정은 차변 잔액이 음수로 표시된다.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MonthlyIncomeStatementService {

    private static final String ROW_ACCOUNT = "ACCOUNT";
    private static final String ROW_SUBTOTAL = "SUBTOTAL";
    private static final String ROW_TOTAL = "TOTAL";
    /** V101 이카운트 정본 법인세등 계정. */
    private static final String INCOME_TAX_CODE = "9719";
    private static final Set<AccountCategory> PROFIT_AND_LOSS_CATEGORIES = Set.of(
            AccountCategory.REVENUE,
            AccountCategory.COST_OF_SALES,
            AccountCategory.SGA,
            AccountCategory.NON_OPERATING,
            AccountCategory.INCOME_TAX
    );

    private final JournalLineRepository journalLineRepository;
    private final ChartOfAccountRepository chartOfAccountRepository;

    /**
     * 회계연도 기준 월별손익분석을 조회한다.
     *
     * @param fiscalYear 당기 회계연도
     * @return 당기 월별 매트릭스와 전기 연간 비교
     */
    public MonthlyIncomeStatementResponse findByFiscalYear(int fiscalYear) {
        if (fiscalYear < 1900 || fiscalYear > 2100) {
            throw new IllegalArgumentException("year 는 1900~2100 범위여야 합니다: " + fiscalYear);
        }

        Map<String, ChartOfAccount> accountMap = buildAccountMap();
        List<Map<String, BigDecimal>> currentMonthly = new ArrayList<>();
        for (int month = 1; month <= 12; month++) {
            YearMonth ym = YearMonth.of(fiscalYear, month);
            currentMonthly.add(amountsByAccount(ym.atDay(1), ym.atEndOfMonth(), accountMap));
        }
        Map<String, BigDecimal> priorAnnual = amountsByAccount(
                LocalDate.of(fiscalYear - 1, 1, 1),
                LocalDate.of(fiscalYear - 1, 12, 31),
                accountMap
        );

        List<MonthlyIncomeStatementLine> rows = buildRows(accountMap, currentMonthly, priorAnnual);

        return new MonthlyIncomeStatementResponse(
                fiscalYear,
                fiscalYear - 1,
                LocalDate.of(fiscalYear, 1, 1),
                LocalDate.of(fiscalYear, 12, 31),
                List.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12),
                rows,
                LocalDateTime.now()
        );
    }

    private Map<String, ChartOfAccount> buildAccountMap() {
        Map<String, ChartOfAccount> map = new HashMap<>();
        chartOfAccountRepository.findAll().forEach(account -> map.put(account.getCode(), account));
        return map;
    }

    private Map<String, BigDecimal> amountsByAccount(LocalDate from, LocalDate to,
                                                     Map<String, ChartOfAccount> accountMap) {
        Map<String, BigDecimal> amounts = new HashMap<>();
        for (AccountTotal total : journalLineRepository.aggregatePostedByAccount(from, to)) {
            ChartOfAccount account = accountMap.get(total.getAccountCode());
            if (account == null
                    || !account.isLeaf()
                    || !PROFIT_AND_LOSS_CATEGORIES.contains(account.getCategory())) {
                continue;
            }
            BigDecimal signedAmount = INCOME_TAX_CODE.equals(total.getAccountCode())
                    ? total.getDebitTotal().subtract(total.getCreditTotal())
                    : computeSignedAmount(account.getCategory(), total.getDebitTotal(), total.getCreditTotal());
            amounts.put(total.getAccountCode(), signedAmount);
        }
        return amounts;
    }

    private List<MonthlyIncomeStatementLine> buildRows(Map<String, ChartOfAccount> accountMap,
                                                       List<Map<String, BigDecimal>> currentMonthly,
                                                       Map<String, BigDecimal> priorAnnual) {
        List<MonthlyIncomeStatementLine> rows = new ArrayList<>();

        rows.addAll(accountRows("REVENUE", AccountCategory.REVENUE, accountMap, currentMonthly, priorAnnual));
        rows.add(subtotalRow("REVENUE", "매출액 합계",
                sumSection(currentMonthly, AccountCategory.REVENUE, accountMap),
                sumSection(priorAnnual, AccountCategory.REVENUE, accountMap), 4099));

        rows.addAll(accountRows("COST_OF_SALES", AccountCategory.COST_OF_SALES, accountMap, currentMonthly, priorAnnual));
        rows.add(subtotalRow("COST_OF_SALES", "매출원가 합계",
                sumSection(currentMonthly, AccountCategory.COST_OF_SALES, accountMap),
                sumSection(priorAnnual, AccountCategory.COST_OF_SALES, accountMap), 5099));

        List<BigDecimal> grossProfit = subtract(
                sumSection(currentMonthly, AccountCategory.REVENUE, accountMap),
                sumSection(currentMonthly, AccountCategory.COST_OF_SALES, accountMap));
        BigDecimal grossProfitPrior = sumSection(priorAnnual, AccountCategory.REVENUE, accountMap)
                .subtract(sumSection(priorAnnual, AccountCategory.COST_OF_SALES, accountMap));
        rows.add(formulaRow("GROSS_PROFIT", "매출총이익", grossProfit, grossProfitPrior, 5999));

        rows.addAll(accountRows("SGA", AccountCategory.SGA, accountMap, currentMonthly, priorAnnual));
        rows.add(subtotalRow("SGA", "판매비와관리비 합계",
                sumSection(currentMonthly, AccountCategory.SGA, accountMap),
                sumSection(priorAnnual, AccountCategory.SGA, accountMap), 8999));

        List<BigDecimal> operatingProfit = subtract(grossProfit,
                sumSection(currentMonthly, AccountCategory.SGA, accountMap));
        BigDecimal operatingProfitPrior = grossProfitPrior
                .subtract(sumSection(priorAnnual, AccountCategory.SGA, accountMap));
        rows.add(formulaRow("OPERATING_PROFIT", "영업이익", operatingProfit, operatingProfitPrior, 9000));

        rows.addAll(accountRows("NON_OPERATING", AccountCategory.NON_OPERATING, accountMap, currentMonthly, priorAnnual));
        rows.add(subtotalRow("NON_OPERATING", "영업외손익 합계",
                sumSection(currentMonthly, AccountCategory.NON_OPERATING, accountMap),
                sumSection(priorAnnual, AccountCategory.NON_OPERATING, accountMap), 9899));

        List<BigDecimal> incomeBeforeTax = add(operatingProfit,
                sumSection(currentMonthly, AccountCategory.NON_OPERATING, accountMap));
        BigDecimal incomeBeforeTaxPrior = operatingProfitPrior
                .add(sumSection(priorAnnual, AccountCategory.NON_OPERATING, accountMap));
        rows.add(formulaRow("INCOME_BEFORE_TAX", "법인세차감전순이익",
                incomeBeforeTax, incomeBeforeTaxPrior, 9900));

        List<BigDecimal> incomeTax = incomeTaxAmounts(currentMonthly, accountMap);
        BigDecimal incomeTaxPrior = incomeTaxAmount(priorAnnual, accountMap);
        rows.add(subtotalRow("INCOME_TAX", "법인세비용", incomeTax, incomeTaxPrior, 9910));

        rows.add(totalRow("NET_INCOME", "당기순이익",
                subtract(incomeBeforeTax, incomeTax),
                incomeBeforeTaxPrior.subtract(incomeTaxPrior), 9999));

        return rows;
    }

    private List<MonthlyIncomeStatementLine> accountRows(String section,
                                                         AccountCategory category,
                                                         Map<String, ChartOfAccount> accountMap,
                                                         List<Map<String, BigDecimal>> currentMonthly,
                                                         Map<String, BigDecimal> priorAnnual) {
        return accountMap.values().stream()
                .filter(account -> account.getCategory() == category && account.isLeaf())
                .filter(account -> !INCOME_TAX_CODE.equals(account.getCode()))
                .filter(account -> hasAnyAmount(account.getCode(), currentMonthly, priorAnnual))
                .sorted(Comparator.comparingInt(ChartOfAccount::getDisplayOrder))
                .map(account -> {
                    List<BigDecimal> months = monthlyAmounts(account.getCode(), currentMonthly);
                    BigDecimal annual = sum(months);
                    BigDecimal prior = priorAnnual.getOrDefault(account.getCode(), BigDecimal.ZERO);
                    return new MonthlyIncomeStatementLine(
                            ROW_ACCOUNT,
                            section,
                            account.getCode(),
                            account.getName(),
                            category.name(),
                            months,
                            annual,
                            prior,
                            annual.subtract(prior),
                            account.getDisplayOrder()
                    );
                })
                .toList();
    }

    private boolean hasAnyAmount(String accountCode,
                                 List<Map<String, BigDecimal>> currentMonthly,
                                 Map<String, BigDecimal> priorAnnual) {
        if (priorAnnual.getOrDefault(accountCode, BigDecimal.ZERO).compareTo(BigDecimal.ZERO) != 0) {
            return true;
        }
        return currentMonthly.stream()
                .map(month -> month.getOrDefault(accountCode, BigDecimal.ZERO))
                .anyMatch(amount -> amount.compareTo(BigDecimal.ZERO) != 0);
    }

    private MonthlyIncomeStatementLine subtotalRow(String section, String label,
                                                   List<BigDecimal> monthlyAmounts,
                                                   BigDecimal priorYearTotal,
                                                   int sortOrder) {
        BigDecimal annual = sum(monthlyAmounts);
        return new MonthlyIncomeStatementLine(
                ROW_SUBTOTAL,
                section,
                null,
                label,
                null,
                monthlyAmounts,
                annual,
                priorYearTotal,
                annual.subtract(priorYearTotal),
                sortOrder
        );
    }

    private MonthlyIncomeStatementLine formulaRow(String section, String label,
                                                  List<BigDecimal> monthlyAmounts,
                                                  BigDecimal priorYearTotal,
                                                  int sortOrder) {
        return subtotalRow(section, label, monthlyAmounts, priorYearTotal, sortOrder);
    }

    private MonthlyIncomeStatementLine totalRow(String section, String label,
                                                List<BigDecimal> monthlyAmounts,
                                                BigDecimal priorYearTotal,
                                                int sortOrder) {
        BigDecimal annual = sum(monthlyAmounts);
        return new MonthlyIncomeStatementLine(
                ROW_TOTAL,
                section,
                null,
                label,
                null,
                monthlyAmounts,
                annual,
                priorYearTotal,
                annual.subtract(priorYearTotal),
                sortOrder
        );
    }

    private List<BigDecimal> monthlyAmounts(String accountCode,
                                            List<Map<String, BigDecimal>> currentMonthly) {
        return currentMonthly.stream()
                .map(month -> month.getOrDefault(accountCode, BigDecimal.ZERO))
                .toList();
    }

    private List<BigDecimal> sumSection(List<Map<String, BigDecimal>> monthly,
                                        AccountCategory category,
                                        Map<String, ChartOfAccount> accountMap) {
        List<BigDecimal> result = new ArrayList<>();
        for (Map<String, BigDecimal> month : monthly) {
            result.add(sumSection(month, category, accountMap));
        }
        return result;
    }

    private BigDecimal sumSection(Map<String, BigDecimal> amounts,
                                  AccountCategory category,
                                  Map<String, ChartOfAccount> accountMap) {
        BigDecimal total = BigDecimal.ZERO;
        for (Map.Entry<String, BigDecimal> entry : amounts.entrySet()) {
            ChartOfAccount account = accountMap.get(entry.getKey());
            if (account != null && account.getCategory() == category
                    && !(category == AccountCategory.NON_OPERATING
                    && INCOME_TAX_CODE.equals(account.getCode()))) {
                total = total.add(entry.getValue());
            }
        }
        return total;
    }

    private List<BigDecimal> incomeTaxAmounts(List<Map<String, BigDecimal>> monthly,
                                              Map<String, ChartOfAccount> accountMap) {
        List<BigDecimal> result = new ArrayList<>();
        for (Map<String, BigDecimal> month : monthly) {
            result.add(incomeTaxAmount(month, accountMap));
        }
        return result;
    }

    private BigDecimal incomeTaxAmount(Map<String, BigDecimal> amounts,
                                       Map<String, ChartOfAccount> accountMap) {
        BigDecimal total = BigDecimal.ZERO;
        for (Map.Entry<String, BigDecimal> entry : amounts.entrySet()) {
            ChartOfAccount account = accountMap.get(entry.getKey());
            if (INCOME_TAX_CODE.equals(entry.getKey())) {
                total = total.add(entry.getValue());
            }
        }
        return total;
    }

    private List<BigDecimal> add(List<BigDecimal> left, List<BigDecimal> right) {
        List<BigDecimal> result = new ArrayList<>();
        for (int i = 0; i < left.size(); i++) {
            result.add(left.get(i).add(right.get(i)));
        }
        return result;
    }

    private List<BigDecimal> subtract(List<BigDecimal> left, List<BigDecimal> right) {
        List<BigDecimal> result = new ArrayList<>();
        for (int i = 0; i < left.size(); i++) {
            result.add(left.get(i).subtract(right.get(i)));
        }
        return result;
    }

    private BigDecimal sum(List<BigDecimal> amounts) {
        return amounts.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal computeSignedAmount(AccountCategory category,
                                           BigDecimal debit,
                                           BigDecimal credit) {
        return switch (category) {
            case REVENUE, NON_OPERATING -> credit.subtract(debit);
            case COST_OF_SALES, SGA, INCOME_TAX -> debit.subtract(credit);
            default -> BigDecimal.ZERO;
        };
    }
}
