package com.samhanair.logis.accounting.report;

import com.samhanair.logis.accounting.domain.AccountCategory;
import com.samhanair.logis.accounting.domain.ChartOfAccount;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.AccountTotal;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 합계잔액시산표 집계 Service.
 *
 * <p>POSTED+REVERSED(보상쌍 상쇄) 분개를 {@code GROUP BY accountCode} 로 집계한다. 컬렉션 {@code JOIN FETCH} 를
 * 사용하지 않으므로 다중 라인 전표에서도 root row 중복이나 카르테시안 증폭이 발생하지 않는다.
 *
 * <p>부호 규칙:
 * <ul>
 *   <li>ASSET / COST_OF_SALES / SGA / INCOME_TAX = 차변잔액 계정</li>
 *   <li>LIABILITY / EQUITY / REVENUE / NON_OPERATING = 대변잔액 계정</li>
 * </ul>
 *
 * <p>기말잔액 4컬럼 배치는 계정 성격과 잔액 부호를 함께 본다. 정상 방향 잔액은 정상
 * 컬럼에 양수로 표시하고, 음수 잔액은 반대 컬럼에 절대값으로 표시한다. 예를 들어 ASSET
 * 계정이 대변 초과로 마감되면 {@code debitBalance} 가 아니라 {@code creditBalance} 에
 * 양수 금액을 표시한다.
 *
 * <p>한계: P&amp;L 계정(REVENUE / COST_OF_SALES / SGA / NON_OPERATING / INCOME_TAX)은
 * 회계연도 경계에서 집합손익 및 이익잉여금으로 대체하는 연말 결산분개가 아직 도입되지
 * 않았다. 따라서 전년 손익 누적 리셋은 별도 결산 슬라이스에서 처리해야 한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TrialBalanceSummaryService {

    private static final String UNKNOWN_ACCOUNT_NAME = "미정의 계정";

    private final JournalLineRepository journalLineRepository;
    private final ChartOfAccountRepository chartOfAccountRepository;

    /**
     * 임의기간 합계잔액시산표를 조회한다.
     *
     * @param from 조회 시작일
     * @param to 조회 종료일
     * @param granularity 클라이언트 토글 단위. null 이면 RANGE
     * @return 합계잔액시산표 응답
     */
    public TrialBalanceSummaryResponse findSummary(LocalDate from, LocalDate to,
                                                   TrialBalanceGranularity granularity) {
        validateRange(from, to);
        TrialBalanceGranularity resolvedGranularity =
                granularity == null ? TrialBalanceGranularity.RANGE : granularity;

        Map<String, ChartOfAccount> accounts = accountMap();
        Map<String, AccountTotal> openingRows = rowsByAccount(
                journalLineRepository.aggregatePostedUpTo(from.minusDays(1)));
        Map<String, AccountTotal> periodRows = rowsByAccount(
                journalLineRepository.aggregatePostedByAccount(from, to));

        LinkedHashSet<String> accountCodes = new LinkedHashSet<>();
        accountCodes.addAll(openingRows.keySet());
        accountCodes.addAll(periodRows.keySet());

        List<TrialBalanceSummaryLine> rows = accountCodes.stream()
                .map(code -> buildLine(code, accounts.get(code), openingRows.get(code), periodRows.get(code)))
                .filter(line -> !isAllZero(line.openingBalance(), line.debitTotal(),
                        line.creditTotal(), line.closingBalance()))
                .sorted(Comparator.comparing(TrialBalanceSummaryLine::accountCode))
                .toList();

        return new TrialBalanceSummaryResponse(
                from,
                to,
                resolvedGranularity,
                rows,
                totals(rows),
                LocalDateTime.now()
        );
    }

    private TrialBalanceSummaryLine buildLine(String accountCode, ChartOfAccount account,
                                              AccountTotal openingRow, AccountTotal periodRow) {
        AccountCategory category = categoryOf(account, accountCode);
        BigDecimal openingDebit = openingRow == null ? BigDecimal.ZERO : openingRow.getDebitTotal();
        BigDecimal openingCredit = openingRow == null ? BigDecimal.ZERO : openingRow.getCreditTotal();
        BigDecimal periodDebit = periodRow == null ? BigDecimal.ZERO : periodRow.getDebitTotal();
        BigDecimal periodCredit = periodRow == null ? BigDecimal.ZERO : periodRow.getCreditTotal();

        BigDecimal openingBalance = computeBalance(category, openingDebit, openingCredit);
        BigDecimal closingBalance = computeBalance(category,
                openingDebit.add(periodDebit), openingCredit.add(periodCredit));

        boolean debitBalance = isDebitBalanceCategory(category);
        BigDecimal debitBalanceAmount = balanceColumnAmount(closingBalance, debitBalance);
        BigDecimal creditBalanceAmount = balanceColumnAmount(closingBalance, !debitBalance);
        return new TrialBalanceSummaryLine(
                accountCode,
                account == null ? UNKNOWN_ACCOUNT_NAME : account.getName(),
                category,
                category.getDisplayName(),
                openingBalance,
                debitBalanceAmount,
                periodDebit,
                periodCredit,
                creditBalanceAmount,
                closingBalance
        );
    }

    private TrialBalanceSummaryTotals totals(List<TrialBalanceSummaryLine> rows) {
        BigDecimal openingBalanceTotal = BigDecimal.ZERO;
        BigDecimal debitBalanceTotal = BigDecimal.ZERO;
        BigDecimal debitTotal = BigDecimal.ZERO;
        BigDecimal creditTotal = BigDecimal.ZERO;
        BigDecimal creditBalanceTotal = BigDecimal.ZERO;
        BigDecimal closingBalanceTotal = BigDecimal.ZERO;

        for (TrialBalanceSummaryLine row : rows) {
            openingBalanceTotal = openingBalanceTotal.add(row.openingBalance());
            debitBalanceTotal = debitBalanceTotal.add(row.debitBalance());
            debitTotal = debitTotal.add(row.debitTotal());
            creditTotal = creditTotal.add(row.creditTotal());
            creditBalanceTotal = creditBalanceTotal.add(row.creditBalance());
            closingBalanceTotal = closingBalanceTotal.add(row.closingBalance());
        }

        return new TrialBalanceSummaryTotals(
                openingBalanceTotal,
                debitBalanceTotal,
                debitTotal,
                creditTotal,
                creditBalanceTotal,
                closingBalanceTotal,
                debitBalanceTotal.compareTo(creditBalanceTotal) == 0
        );
    }

    private Map<String, AccountTotal> rowsByAccount(List<AccountTotal> rows) {
        Map<String, AccountTotal> map = new LinkedHashMap<>();
        for (AccountTotal row : rows) {
            map.put(row.getAccountCode(), row);
        }
        return map;
    }

    private Map<String, ChartOfAccount> accountMap() {
        Map<String, ChartOfAccount> map = new LinkedHashMap<>();
        chartOfAccountRepository.findAllByOrderByCodeAsc()
                .forEach(account -> map.put(account.getCode(), account));
        return map;
    }

    private BigDecimal computeBalance(AccountCategory category, BigDecimal debit, BigDecimal credit) {
        return isDebitBalanceCategory(category) ? debit.subtract(credit) : credit.subtract(debit);
    }

    private BigDecimal balanceColumnAmount(BigDecimal closingBalance, boolean normalColumn) {
        if (closingBalance.signum() == 0) {
            return BigDecimal.ZERO;
        }
        boolean positiveBalance = closingBalance.signum() > 0;
        return positiveBalance == normalColumn ? closingBalance.abs() : BigDecimal.ZERO;
    }

    private boolean isDebitBalanceCategory(AccountCategory category) {
        return switch (category) {
            case ASSET, COST_OF_SALES, SGA, INCOME_TAX -> true;
            case LIABILITY, EQUITY, REVENUE, NON_OPERATING -> false;
        };
    }

    private AccountCategory categoryOf(ChartOfAccount account, String accountCode) {
        if (account != null) {
            return account.getCategory();
        }
        if (accountCode != null && accountCode.startsWith("2")) {
            return AccountCategory.LIABILITY;
        }
        if (accountCode != null && accountCode.startsWith("3")) {
            return AccountCategory.EQUITY;
        }
        if (accountCode != null && accountCode.startsWith("4")) {
            return AccountCategory.REVENUE;
        }
        if (accountCode != null && accountCode.startsWith("5")) {
            return AccountCategory.COST_OF_SALES;
        }
        if (accountCode != null && accountCode.startsWith("8")) {
            return AccountCategory.SGA;
        }
        if (accountCode != null && accountCode.startsWith("9")) {
            return AccountCategory.NON_OPERATING;
        }
        return AccountCategory.ASSET;
    }

    private boolean isAllZero(BigDecimal... amounts) {
        for (BigDecimal amount : amounts) {
            if (amount.signum() != 0) {
                return false;
            }
        }
        return true;
    }

    private void validateRange(LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new IllegalArgumentException("from/to 날짜는 필수입니다");
        }
        if (from.isAfter(to)) {
            throw new IllegalArgumentException("from 은 to 보다 늦을 수 없습니다");
        }
    }
}
