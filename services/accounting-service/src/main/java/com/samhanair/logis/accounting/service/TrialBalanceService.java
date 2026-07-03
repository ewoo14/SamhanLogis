package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.AccountCategory;
import com.samhanair.logis.accounting.domain.ChartOfAccount;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.web.dto.TrialBalanceResponse;
import com.samhanair.logis.accounting.web.dto.TrialBalanceRowResponse;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 시산표 집계 service (Plan §7 — A2 결정: service-layer 집계, mat view 미사용).
 *
 * <p>POSTED+REVERSED(보상쌍 상쇄) 분개 라인을 집계. 잔액 부호 규약:
 * <ul>
 *   <li>ASSET / COST_OF_SALES / SGA / INCOME_TAX = debit - credit (차변 잔액)</li>
 *   <li>LIABILITY / EQUITY / REVENUE / NON_OPERATING = credit - debit (대변 잔액)</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class TrialBalanceService {

    private final JournalLineRepository journalLineRepository;
    private final ChartOfAccountRepository chartOfAccountRepository;

    /**
     * 지정 회계 월의 시산표 집계.
     *
     * @param period 회계 월 (yyyyMM)
     * @return 7-그룹 행 + 합계
     */
    public TrialBalanceResponse findByPeriod(YearMonth period) {
        LocalDate from = period.atDay(1);
        LocalDate to = period.atEndOfMonth();

        List<JournalLineRepository.AccountTotal> totals =
                journalLineRepository.aggregatePostedByAccount(from, to);

        Map<String, ChartOfAccount> accountMap = new HashMap<>();
        chartOfAccountRepository.findAll().forEach(a -> accountMap.put(a.getCode(), a));

        List<TrialBalanceRowResponse> rows = totals.stream()
                .map(t -> {
                    ChartOfAccount account = accountMap.get(t.getAccountCode());
                    String name = account == null ? "미정의 계정" : account.getName();
                    AccountCategory category = account == null ? AccountCategory.ASSET : account.getCategory();
                    String categoryDisplay = category.getDisplayName();
                    BigDecimal balance = computeBalance(category, t.getDebitTotal(), t.getCreditTotal());
                    return new TrialBalanceRowResponse(t.getAccountCode(), name, category,
                            categoryDisplay, t.getDebitTotal(), t.getCreditTotal(), balance);
                })
                .sorted(Comparator.comparing(TrialBalanceRowResponse::accountCode))
                .toList();

        BigDecimal totalDebit = rows.stream()
                .map(TrialBalanceRowResponse::debitTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalCredit = rows.stream()
                .map(TrialBalanceRowResponse::creditTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new TrialBalanceResponse(period, totalDebit, totalCredit, rows);
    }

    /**
     * 카테고리별 잔액 계산 — 차변 잔액 계정은 (debit - credit), 대변 잔액 계정은 (credit - debit).
     */
    private BigDecimal computeBalance(AccountCategory category, BigDecimal debit, BigDecimal credit) {
        return switch (category) {
            case ASSET, COST_OF_SALES, SGA, INCOME_TAX -> debit.subtract(credit);
            case LIABILITY, EQUITY, REVENUE, NON_OPERATING -> credit.subtract(debit);
        };
    }
}
