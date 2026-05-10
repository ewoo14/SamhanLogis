package com.samhanair.logis.accounting.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.domain.AccountCategory;
import com.samhanair.logis.accounting.domain.ChartOfAccount;
import com.samhanair.logis.accounting.repository.ChartOfAccountRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository;
import com.samhanair.logis.accounting.repository.JournalLineRepository.AccountTotal;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import java.time.YearMonth;

/**
 * IncomeStatementService 단위 테스트.
 *
 * <p>fixture 분개 시나리오:
 * <ul>
 *   <li>401 상품매출 credit 500,000 → 매출 500,000</li>
 *   <li>501 상품매출원가 debit 300,000 → 매출원가 300,000</li>
 *   <li>801 급여 debit 80,000 → 판관비 80,000</li>
 *   <li>901 이자수익 credit 10,000 → 영업외수익 +10,000</li>
 *   <li>951 이자비용 debit 5,000 → 영업외비용 -5,000</li>
 *   <li>991 법인세비용 debit 25,000</li>
 * </ul>
 *
 * <p>기대값:
 * <ul>
 *   <li>매출총이익 = 500,000 - 300,000 = 200,000</li>
 *   <li>영업이익 = 200,000 - 80,000 = 120,000</li>
 *   <li>영업외손익 소계 = 10,000 + (-5,000) = 5,000</li>
 *   <li>법인세차감전순이익 = 120,000 + 5,000 = 125,000</li>
 *   <li>당기순이익 = 125,000 - 25,000 = 100,000</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class IncomeStatementServiceTest {

    @Mock private JournalLineRepository journalLineRepository;
    @Mock private ChartOfAccountRepository chartOfAccountRepository;

    @InjectMocks private IncomeStatementService incomeStatementService;

    private static final YearMonth PERIOD = YearMonth.of(2026, 4);

    @BeforeEach
    void setUp() {
        // ChartOfAccount 목록 stub
        when(chartOfAccountRepository.findAll()).thenReturn(buildChartOfAccounts());
        // aggregatePostedByAccount stub (기간 무관하게 동일 fixture 반환)
        when(journalLineRepository.aggregatePostedByAccount(any(LocalDate.class), any(LocalDate.class)))
                .thenReturn(buildAccountTotals());
    }

    @Test
    @DisplayName("단월 손익계산서 — 매출총이익 / 영업이익 / 당기순이익 검증")
    void findByPeriod_correctProfits() {
        IncomeStatementResponse resp = incomeStatementService.findByPeriod(PERIOD);

        assertThat(resp.totalRevenue()).isEqualByComparingTo("500000");
        assertThat(resp.totalCostOfSales()).isEqualByComparingTo("300000");
        assertThat(resp.grossProfit()).isEqualByComparingTo("200000");
        assertThat(resp.totalSga()).isEqualByComparingTo("80000");
        assertThat(resp.operatingProfit()).isEqualByComparingTo("120000");
        assertThat(resp.totalNonOperating()).isEqualByComparingTo("5000");
        assertThat(resp.incomeBeforeTax()).isEqualByComparingTo("125000");
        assertThat(resp.incomeTax()).isEqualByComparingTo("25000");
        assertThat(resp.netIncome()).isEqualByComparingTo("100000");
    }

    @Test
    @DisplayName("단월 손익계산서 — period 레이블 형식 검증")
    void findByPeriod_periodLabel() {
        IncomeStatementResponse resp = incomeStatementService.findByPeriod(PERIOD);

        assertThat(resp.period()).isEqualTo("2026-04");
        assertThat(resp.fromDate()).isEqualTo(LocalDate.of(2026, 4, 1));
        assertThat(resp.toDate()).isEqualTo(LocalDate.of(2026, 4, 30));
    }

    @Test
    @DisplayName("기간 손익계산서 — period 레이블 범위 형식 검증")
    void findByPeriodRange_label() {
        IncomeStatementResponse resp = incomeStatementService.findByPeriodRange(
                YearMonth.of(2026, 4), YearMonth.of(2026, 5));

        assertThat(resp.period()).isEqualTo("2026-04 ~ 2026-05");
    }

    @Test
    @DisplayName("기간 손익계산서 — fromPeriod > toPeriod 예외")
    void findByPeriodRange_invalidRange_throws() {
        assertThatThrownBy(() -> incomeStatementService.findByPeriodRange(
                YearMonth.of(2026, 5), YearMonth.of(2026, 4)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("fromPeriod");
    }

    @Test
    @DisplayName("단월 손익계산서 — 매출 행 목록 포함 검증")
    void findByPeriod_revenueLines() {
        IncomeStatementResponse resp = incomeStatementService.findByPeriod(PERIOD);

        assertThat(resp.revenue()).hasSize(1);
        assertThat(resp.revenue().get(0).accountCode()).isEqualTo("401");
        assertThat(resp.revenue().get(0).amount()).isEqualByComparingTo("500000");
    }

    @Test
    @DisplayName("단월 손익계산서 — 영업외수익/비용 행 포함 검증")
    void findByPeriod_nonOperatingLines() {
        IncomeStatementResponse resp = incomeStatementService.findByPeriod(PERIOD);

        // 901 이자수익 (+10,000), 951 이자비용 (-5,000)
        assertThat(resp.nonOperating()).hasSize(2);
        IncomeStatementLine interest = resp.nonOperating().stream()
                .filter(l -> "901".equals(l.accountCode())).findFirst().orElseThrow();
        assertThat(interest.amount()).isEqualByComparingTo("10000");

        IncomeStatementLine interestExp = resp.nonOperating().stream()
                .filter(l -> "951".equals(l.accountCode())).findFirst().orElseThrow();
        assertThat(interestExp.amount()).isEqualByComparingTo("-5000");
    }

    // ===================== Fixture 헬퍼 =====================

    /**
     * 테스트용 계정과목 목록 생성.
     * ChartOfAccount.create() 팩토리 메서드를 사용하여 도메인 가드 준수.
     */
    private List<ChartOfAccount> buildChartOfAccounts() {
        return List.of(
                ChartOfAccount.create("401", "상품매출",   AccountCategory.REVENUE,       "400", true, 4010),
                ChartOfAccount.create("501", "상품매출원가", AccountCategory.COST_OF_SALES, "500", true, 5010),
                ChartOfAccount.create("801", "급여",       AccountCategory.SGA,           "800", true, 8010),
                ChartOfAccount.create("901", "이자수익",   AccountCategory.NON_OPERATING, "900", true, 9010),
                ChartOfAccount.create("951", "이자비용",   AccountCategory.NON_OPERATING, "900", true, 9510),
                ChartOfAccount.create("991", "법인세비용", AccountCategory.INCOME_TAX,    null,  true, 9910)
        );
    }

    /**
     * 테스트용 집계 결과 stub 생성.
     */
    private List<AccountTotal> buildAccountTotals() {
        return List.of(
                accountTotal("401", BigDecimal.ZERO,           new BigDecimal("500000")),
                accountTotal("501", new BigDecimal("300000"),  BigDecimal.ZERO),
                accountTotal("801", new BigDecimal("80000"),   BigDecimal.ZERO),
                accountTotal("901", BigDecimal.ZERO,           new BigDecimal("10000")),
                accountTotal("951", new BigDecimal("5000"),    BigDecimal.ZERO),
                accountTotal("991", new BigDecimal("25000"),   BigDecimal.ZERO)
        );
    }

    private AccountTotal accountTotal(String code, BigDecimal debit, BigDecimal credit) {
        return new AccountTotal() {
            @Override public String getAccountCode() { return code; }
            @Override public BigDecimal getDebitTotal() { return debit; }
            @Override public BigDecimal getCreditTotal() { return credit; }
        };
    }
}
