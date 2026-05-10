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

/**
 * BalanceSheetService 단위 테스트.
 *
 * <p>fixture 분개 시나리오 (설립 이후 누적):
 * <ul>
 *   <li>101 현금 debit 1,000,000 (자산)</li>
 *   <li>102 보통예금 debit 500,000 (자산)</li>
 *   <li>201 외상매입금 credit 300,000 (부채)</li>
 *   <li>301 자본금 credit 800,000 (자본)</li>
 *   <li>401 상품매출 credit 500,000 (매출 — P&L, 당기순이익 가산됨)</li>
 *   <li>501 상품매출원가 debit 300,000 (매출원가 — P&L, 당기순이익 차감됨)</li>
 * </ul>
 *
 * <p>기대값:
 * <ul>
 *   <li>총 자산 = 1,000,000 + 500,000 = 1,500,000</li>
 *   <li>총 부채 = 300,000</li>
 *   <li>당기순이익 (P&L) = 매출 - 매출원가 = 500,000 - 300,000 = 200,000</li>
 *   <li>총 자본 = 자본금 800,000 + 미처분이익잉여금 200,000 = 1,000,000</li>
 *   <li>부채+자본 = 1,300,000</li>
 *   <li>balanced = false (자산 1,500,000 ≠ 부채+자본 1,300,000 → 불일치는 fixture 단순화로 인한 의도적 설계)</li>
 * </ul>
 *
 * <p>Note: fixture 는 복식부기 완전성 없는 단순 단위 테스트용. balanced=false 는 의도된 결과.
 */
@ExtendWith(MockitoExtension.class)
class BalanceSheetServiceTest {

    @Mock private JournalLineRepository journalLineRepository;
    @Mock private ChartOfAccountRepository chartOfAccountRepository;

    @InjectMocks private BalanceSheetService balanceSheetService;

    private static final LocalDate AS_OF = LocalDate.of(2026, 4, 30);

    @BeforeEach
    void setUp() {
        when(chartOfAccountRepository.findAll()).thenReturn(buildChartOfAccounts());
        when(journalLineRepository.aggregatePostedUpTo(any(LocalDate.class)))
                .thenReturn(buildAccountTotals());
    }

    @Test
    @DisplayName("재무상태표 — 총 자산 / 총 부채 / 총 자본 검증")
    void findByAsOfDate_totals() {
        BalanceSheetResponse resp = balanceSheetService.findByAsOfDate(AS_OF);

        assertThat(resp.totalAssets()).isEqualByComparingTo("1500000");
        assertThat(resp.totalLiabilities()).isEqualByComparingTo("300000");
        // 자본금 800,000 + 미처분이익잉여금(당기순이익) 200,000
        assertThat(resp.totalEquity()).isEqualByComparingTo("1000000");
    }

    @Test
    @DisplayName("재무상태표 — 부채+자본 합계 = totalLiabilitiesAndEquity")
    void findByAsOfDate_liabilityPlusEquity() {
        BalanceSheetResponse resp = balanceSheetService.findByAsOfDate(AS_OF);

        assertThat(resp.totalLiabilitiesAndEquity())
                .isEqualByComparingTo(resp.totalLiabilities().add(resp.totalEquity()));
        assertThat(resp.totalLiabilitiesAndEquity()).isEqualByComparingTo("1300000");
    }

    @Test
    @DisplayName("재무상태표 — 미처분이익잉여금 행 존재 검증 (당기순이익 자동 가산)")
    void findByAsOfDate_retainedEarningsLine() {
        BalanceSheetResponse resp = balanceSheetService.findByAsOfDate(AS_OF);

        BalanceSheetLine retainedEarnings = resp.equity().stream()
                .filter(l -> "343".equals(l.accountCode()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("343 미처분이익잉여금 행 없음"));
        assertThat(retainedEarnings.amount()).isEqualByComparingTo("200000");
    }

    @Test
    @DisplayName("재무상태표 — balanced=false (fixture 불일치 의도)")
    void findByAsOfDate_notBalanced() {
        BalanceSheetResponse resp = balanceSheetService.findByAsOfDate(AS_OF);

        // 자산(1,500,000) ≠ 부채+자본(1,300,000) → balanced false
        assertThat(resp.balanced()).isFalse();
    }

    @Test
    @DisplayName("재무상태표 — asOfDate 기준일 검증")
    void findByAsOfDate_asOfDate() {
        BalanceSheetResponse resp = balanceSheetService.findByAsOfDate(AS_OF);

        assertThat(resp.asOfDate()).isEqualTo(AS_OF);
    }

    @Test
    @DisplayName("재무상태표 — asOfDate null 예외")
    void findByAsOfDate_nullDate_throws() {
        assertThatThrownBy(() -> balanceSheetService.findByAsOfDate(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("asOfDate");
    }

    @Test
    @DisplayName("재무상태표 — balanced=true 케이스 (복식부기 완전 fixture)")
    void findByAsOfDate_balanced() {
        // 자산 = 부채 + 자본 + 당기순이익이 일치하는 완전 fixture 를 재stub
        when(journalLineRepository.aggregatePostedUpTo(any(LocalDate.class)))
                .thenReturn(buildBalancedTotals());

        BalanceSheetResponse resp = balanceSheetService.findByAsOfDate(AS_OF);

        assertThat(resp.balanced()).isTrue();
        assertThat(resp.totalAssets()).isEqualByComparingTo(resp.totalLiabilitiesAndEquity());
    }

    // ===================== Fixture 헬퍼 =====================

    private List<ChartOfAccount> buildChartOfAccounts() {
        return List.of(
                ChartOfAccount.create("101", "현금",       AccountCategory.ASSET,         "100", true, 1010),
                ChartOfAccount.create("102", "보통예금",   AccountCategory.ASSET,         "100", true, 1020),
                ChartOfAccount.create("201", "외상매입금", AccountCategory.LIABILITY,     "200", true, 2010),
                ChartOfAccount.create("301", "자본금",     AccountCategory.EQUITY,        "300", true, 3010),
                ChartOfAccount.create("343", "미처분이익잉여금", AccountCategory.EQUITY,   "300", true, 3430),
                ChartOfAccount.create("401", "상품매출",   AccountCategory.REVENUE,       "400", true, 4010),
                ChartOfAccount.create("501", "상품매출원가", AccountCategory.COST_OF_SALES, "500", true, 5010)
        );
    }

    /**
     * 기본 fixture — 자산(1,500,000) ≠ 부채+자본(1,300,000) → balanced=false.
     */
    private List<AccountTotal> buildAccountTotals() {
        return List.of(
                accountTotal("101", new BigDecimal("1000000"), BigDecimal.ZERO),
                accountTotal("102", new BigDecimal("500000"),  BigDecimal.ZERO),
                accountTotal("201", BigDecimal.ZERO,           new BigDecimal("300000")),
                accountTotal("301", BigDecimal.ZERO,           new BigDecimal("800000")),
                accountTotal("401", BigDecimal.ZERO,           new BigDecimal("500000")),
                accountTotal("501", new BigDecimal("300000"),  BigDecimal.ZERO)
        );
    }

    /**
     * balanced=true fixture:
     * 자산 = 현금 1,200,000
     * 부채 = 외상매입금 200,000
     * 자본 = 자본금 800,000
     * P&L = 매출 400,000 - 매출원가 200,000 = 당기순이익 200,000
     * → 자산(1,200,000) == 부채(200,000) + 자본(800,000 + 200,000 = 1,000,000) = 1,200,000.
     */
    private List<AccountTotal> buildBalancedTotals() {
        return List.of(
                accountTotal("101", new BigDecimal("1200000"), BigDecimal.ZERO),
                accountTotal("201", BigDecimal.ZERO,           new BigDecimal("200000")),
                accountTotal("301", BigDecimal.ZERO,           new BigDecimal("800000")),
                accountTotal("401", BigDecimal.ZERO,           new BigDecimal("400000")),
                accountTotal("501", new BigDecimal("200000"),  BigDecimal.ZERO)
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
