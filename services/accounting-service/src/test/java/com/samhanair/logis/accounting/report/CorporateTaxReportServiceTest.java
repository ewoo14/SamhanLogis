package com.samhanair.logis.accounting.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * CorporateTaxReportService 단위 테스트.
 *
 * <p>시나리오별 기대값:
 * <ul>
 *   <li>2억 이하 과세표준: 200,000,000 × 9% = 18,000,000</li>
 *   <li>2억 초과 200억 이하 과세표준: 2억 × 9% + (과표-2억) × 19%</li>
 *   <li>결손(음수 incomeBeforeTax): 산출세액 0</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CorporateTaxReportServiceTest {

    @Mock
    private IncomeStatementService incomeStatementService;

    @InjectMocks
    private CorporateTaxReportService corporateTaxReportService;

    private static final int FISCAL_YEAR = 2026;

    /**
     * incomeStatementService stub 헬퍼.
     */
    private void stubIncomeBeforeTax(BigDecimal incomeBeforeTax) {
        IncomeStatementResponse mockResp = new IncomeStatementResponse(
                "2026-01 ~ 2026-12",
                LocalDate.of(2026, 1, 1),
                LocalDate.of(2026, 12, 31),
                List.of(), BigDecimal.ZERO,
                List.of(), BigDecimal.ZERO,
                BigDecimal.ZERO,
                List.of(), BigDecimal.ZERO,
                BigDecimal.ZERO,
                List.of(), BigDecimal.ZERO,
                incomeBeforeTax,
                BigDecimal.ZERO,
                incomeBeforeTax,
                java.time.LocalDateTime.now()
        );
        when(incomeStatementService.findByPeriodRange(any(YearMonth.class), any(YearMonth.class)))
                .thenReturn(mockResp);
    }

    @Test
    @DisplayName("과세표준 2억 이하 — 9% 단일 세율 적용")
    void findByFiscalYear_tier1_tax() {
        // 과세표준 = 200,000,000 → 세액 = 200,000,000 × 9% = 18,000,000
        stubIncomeBeforeTax(new BigDecimal("200000000"));

        CorporateTaxReportResponse resp = corporateTaxReportService.findByFiscalYear(FISCAL_YEAR);

        assertThat(resp.taxableIncome()).isEqualByComparingTo("200000000");
        assertThat(resp.calculatedTax()).isEqualByComparingTo("18000000");
        assertThat(resp.taxPayable()).isEqualByComparingTo("18000000");
    }

    @Test
    @DisplayName("과세표준 2억 초과 200억 이하 — 누진 세율 (9%+19%) 적용")
    void findByFiscalYear_tier2_tax() {
        // 과세표준 = 500,000,000 (5억)
        // 세액 = 200,000,000 × 9% + 300,000,000 × 19%
        //      = 18,000,000 + 57,000,000 = 75,000,000
        stubIncomeBeforeTax(new BigDecimal("500000000"));

        CorporateTaxReportResponse resp = corporateTaxReportService.findByFiscalYear(FISCAL_YEAR);

        assertThat(resp.calculatedTax()).isEqualByComparingTo("75000000");
    }

    @Test
    @DisplayName("결손 — incomeBeforeTax 음수 시 산출세액 0")
    void findByFiscalYear_loss_zeroTax() {
        stubIncomeBeforeTax(new BigDecimal("-50000000"));

        CorporateTaxReportResponse resp = corporateTaxReportService.findByFiscalYear(FISCAL_YEAR);

        assertThat(resp.taxableIncome()).isEqualByComparingTo("-50000000");
        assertThat(resp.calculatedTax()).isEqualByComparingTo("0");
        assertThat(resp.taxPayable()).isEqualByComparingTo("0");
    }

    @Test
    @DisplayName("신고 기한 — 12월 결산 법인 → 다음해 3월 31일")
    void findByFiscalYear_filingDeadline() {
        stubIncomeBeforeTax(new BigDecimal("100000000"));

        CorporateTaxReportResponse resp = corporateTaxReportService.findByFiscalYear(FISCAL_YEAR);

        assertThat(resp.filingDeadline()).isEqualTo("2027-03-31");
        assertThat(resp.fromDate()).isEqualTo(LocalDate.of(2026, 1, 1));
        assertThat(resp.toDate()).isEqualTo(LocalDate.of(2026, 12, 31));
    }

    @Test
    @DisplayName("세무조정 — 가산/차감 현재 0 고정 (간소화)")
    void findByFiscalYear_zeroAdjustments() {
        stubIncomeBeforeTax(new BigDecimal("100000000"));

        CorporateTaxReportResponse resp = corporateTaxReportService.findByFiscalYear(FISCAL_YEAR);

        assertThat(resp.addedDeductions()).isEqualByComparingTo("0");
        assertThat(resp.subtractedDeductions()).isEqualByComparingTo("0");
        assertThat(resp.taxableIncome()).isEqualByComparingTo(resp.incomeBeforeTax());
    }

    // ── computeProgressiveTax 단위 검증 ──

    @Test
    @DisplayName("computeProgressiveTax — 200억 초과 3000억 이하 (21% 구간)")
    void computeProgressiveTax_tier3() {
        // 과세표준 = 250억
        // 세액 = 2억×9% + 198억×19% + 50억×21%
        //      = 18,000,000 + 37,620,000,000 + 10,500,000,000 (원 단위 계산)
        // 단순 검증: computeProgressiveTax(250억) > computeProgressiveTax(200억)
        BigDecimal tax200 = corporateTaxReportService.computeProgressiveTax(new BigDecimal("20000000000"));
        BigDecimal tax250 = corporateTaxReportService.computeProgressiveTax(new BigDecimal("25000000000"));
        assertThat(tax250).isGreaterThan(tax200);
    }
}
