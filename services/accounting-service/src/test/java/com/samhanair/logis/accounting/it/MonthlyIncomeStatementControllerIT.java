package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * 월별손익분석 IT.
 *
 * <p>실 PostgreSQL 에 POSTED 분개를 여러 달로 시드하고 손익계정 × 월 매트릭스,
 * 손익 소계 산식, 전기 연간 비교 컬럼을 HTTP 응답 기준으로 검증한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class MonthlyIncomeStatementControllerIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JournalRepository journalRepository;

    /** 외부 e-Tax client 격리. */
    @MockBean private ETaxClient eTaxClient;
    /** 외부 KFTC client 격리. */
    @MockBean private KftcClient kftcClient;
    /** 동적 권한 client 격리. */
    @MockBean(classes = DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @Test
    @DisplayName("월별손익분석 — 월별 셀/소계/연간합계/전기비교")
    void monthlyIncomeStatementAggregatesMatrixAndPriorYearComparison() throws Exception {
        seedFixtures();

        MvcResult result = mockMvc.perform(get("/accounting/reports/income-statement/monthly")
                        .param("year", "2047")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fiscalYear").value(2047))
                .andExpect(jsonPath("$.data.priorYear").value(2046))
                .andExpect(jsonPath("$.data.months.length()").value(12))
                .andReturn();

        JsonNode rows = objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .get("data").get("rows");

        JsonNode revenue = row(rows, "상품매출");
        assertAmount(revenue.get("monthlyAmounts").get(0), "10000.00");
        assertAmount(revenue.get("monthlyAmounts").get(1), "20000.00");
        assertAmount(revenue.get("monthlyAmounts").get(2), "15000.00");
        assertAmount(revenue.get("monthlyAmounts").get(3), "0");
        assertAmount(revenue.get("annualTotal"), "45000.00");
        assertAmount(revenue.get("priorYearTotal"), "12000.00");
        assertAmount(revenue.get("difference"), "33000.00");

        JsonNode revenueSubtotal = row(rows, "매출액 합계");
        assertAmount(revenueSubtotal.get("annualTotal"), "45000.00");
        assertAmount(revenueSubtotal.get("annualTotal"), sumAccountRows(rows, "REVENUE", "annualTotal"));
        assertAmount(revenueSubtotal.get("priorYearTotal"), sumAccountRows(rows, "REVENUE", "priorYearTotal"));

        JsonNode grossProfit = row(rows, "매출총이익");
        assertAmount(grossProfit.get("monthlyAmounts").get(0), "6000.00");
        assertAmount(grossProfit.get("monthlyAmounts").get(1), "13000.00");
        assertAmount(grossProfit.get("monthlyAmounts").get(2), "10000.00");
        assertAmount(grossProfit.get("annualTotal"), "29000.00");
        assertAmount(grossProfit.get("priorYearTotal"), "8000.00");

        JsonNode operatingProfit = row(rows, "영업이익");
        assertAmount(operatingProfit.get("annualTotal"), "24500.00");

        JsonNode nonOperatingExpense = row(rows, "이자비용");
        assertAmount(nonOperatingExpense.get("monthlyAmounts").get(0), "-300.00");
        assertAmount(nonOperatingExpense.get("annualTotal"), "-300.00");

        JsonNode nonOperatingRevenue = row(rows, "이자수익");
        assertAmount(nonOperatingRevenue.get("monthlyAmounts").get(2), "200.00");
        assertAmount(nonOperatingRevenue.get("annualTotal"), "200.00");

        JsonNode incomeBeforeTax = row(rows, "법인세차감전순이익");
        assertAmount(incomeBeforeTax.get("annualTotal"), "24400.00");

        JsonNode netIncome = row(rows, "당기순이익");
        assertThat(netIncome.get("rowKind").asText()).isEqualTo("TOTAL");
        assertAmount(netIncome.get("annualTotal"), "22900.00");
        assertAmount(netIncome.get("priorYearTotal"), "6700.00");
    }

    @Test
    @DisplayName("월별손익분석 — year 누락/비숫자 query parameter 는 400 INVALID_INPUT")
    void monthlyIncomeStatementInvalidYearParameterReturns400() throws Exception {
        mockMvc.perform(get("/accounting/reports/income-statement/monthly")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));

        mockMvc.perform(get("/accounting/reports/income-statement/monthly")
                        .param("year", "abcd")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    private void seedFixtures() {
        seedPosted("MONTHLY-IS-2046-01-REV", LocalDate.of(2046, 1, 10), "전기 매출",
                line("1019", "12000.00", "0.00"),
                line("4019", "0.00", "12000.00"));
        seedPosted("MONTHLY-IS-2046-01-COST", LocalDate.of(2046, 1, 11), "전기 매출원가",
                line("5019", "4000.00", "0.00"),
                line("1019", "0.00", "4000.00"));
        seedPosted("MONTHLY-IS-2046-01-SGA", LocalDate.of(2046, 1, 12), "전기 판관비",
                line("8029", "1000.00", "0.00"),
                line("1019", "0.00", "1000.00"));
        seedPosted("MONTHLY-IS-2046-01-NONOP", LocalDate.of(2046, 1, 13), "전기 이자수익",
                line("1019", "200.00", "0.00"),
                line("9019", "0.00", "200.00"));
        seedPosted("MONTHLY-IS-2046-01-TAX", LocalDate.of(2046, 1, 14), "전기 법인세",
                line("9719", "500.00", "0.00"),
                line("1019", "0.00", "500.00"));

        seedMonth("MONTHLY-IS-2047-01", LocalDate.of(2047, 1, 10),
                "10000.00", "4000.00", "1000.00", "0.00", "300.00", "500.00");
        seedMonth("MONTHLY-IS-2047-02", LocalDate.of(2047, 2, 10),
                "20000.00", "7000.00", "2000.00", "0.00", "0.00", "0.00");
        seedMonth("MONTHLY-IS-2047-03", LocalDate.of(2047, 3, 10),
                "15000.00", "5000.00", "1500.00", "200.00", "0.00", "1000.00");

        seedPosted("MONTHLY-IS-2047-03-PARENT-REV", LocalDate.of(2047, 3, 20), "통제 계정 직접 분개 제외",
                line("101", "777.00", "0.00"),
                line("400", "0.00", "777.00"));

        seedDraft("MONTHLY-IS-2047-04-DRAFT", LocalDate.of(2047, 4, 10), "미게시 제외",
                line("1019", "999.00", "0.00"),
                line("4019", "0.00", "999.00"));
    }

    private void seedMonth(String prefix, LocalDate date, String revenue, String costOfSales,
                           String sga, String nonOperatingRevenue, String nonOperatingExpense,
                           String incomeTax) {
        seedPosted(prefix + "-REV", date, "당기 매출",
                line("1019", revenue, "0.00"),
                line("4019", "0.00", revenue));
        seedPosted(prefix + "-COST", date.plusDays(1), "당기 매출원가",
                line("5019", costOfSales, "0.00"),
                line("1019", "0.00", costOfSales));
        seedPosted(prefix + "-SGA", date.plusDays(2), "당기 판관비",
                line("8029", sga, "0.00"),
                line("1019", "0.00", sga));
        if (new BigDecimal(nonOperatingRevenue).compareTo(BigDecimal.ZERO) > 0) {
            seedPosted(prefix + "-NONOP-REV", date.plusDays(3), "당기 영업외수익",
                    line("1019", nonOperatingRevenue, "0.00"),
                    line("9019", "0.00", nonOperatingRevenue));
        }
        if (new BigDecimal(nonOperatingExpense).compareTo(BigDecimal.ZERO) > 0) {
            seedPosted(prefix + "-NONOP-EXP", date.plusDays(4), "당기 영업외비용",
                    line("9319", nonOperatingExpense, "0.00"),
                    line("1019", "0.00", nonOperatingExpense));
        }
        if (new BigDecimal(incomeTax).compareTo(BigDecimal.ZERO) > 0) {
            seedPosted(prefix + "-TAX", date.plusDays(5), "당기 법인세",
                    line("9719", incomeTax, "0.00"),
                    line("1019", "0.00", incomeTax));
        }
    }

    private void seedPosted(String journalNo, LocalDate date, String description, LineSpec... specs) {
        Journal journal = journal(journalNo, date, description, specs);
        journal.post("monthly-income-statement-it");
        journalRepository.saveAndFlush(journal);
    }

    private void seedDraft(String journalNo, LocalDate date, String description, LineSpec... specs) {
        journalRepository.saveAndFlush(journal(journalNo, date, description, specs));
    }

    private Journal journal(String journalNo, LocalDate date, String description, LineSpec... specs) {
        Journal journal = Journal.create(journalNo, date, description, JournalSourceType.MANUAL, null);
        int lineNo = 1;
        for (LineSpec spec : specs) {
            journal.addLine(JournalLine.create(
                    journal,
                    lineNo++,
                    spec.accountCode(),
                    new BigDecimal(spec.debit()),
                    new BigDecimal(spec.credit()),
                    null,
                    description
            ));
        }
        return journal;
    }

    private LineSpec line(String accountCode, String debit, String credit) {
        return new LineSpec(accountCode, debit, credit);
    }

    private JsonNode row(JsonNode rows, String accountName) {
        for (JsonNode row : rows) {
            if (accountName.equals(row.get("accountName").asText())) {
                return row;
            }
        }
        throw new AssertionError("월별손익분석 행을 찾지 못했습니다: " + accountName);
    }

    private void assertAmount(JsonNode node, String expected) {
        BigDecimal actual = node.decimalValue();
        BigDecimal expectedAmount = new BigDecimal(expected);
        assertThat(actual).isEqualByComparingTo(expectedAmount);
    }

    private void assertAmount(JsonNode node, BigDecimal expected) {
        BigDecimal actual = node.decimalValue();
        assertThat(actual).isEqualByComparingTo(expected);
    }

    private BigDecimal sumAccountRows(JsonNode rows, String section, String amountField) {
        BigDecimal total = BigDecimal.ZERO;
        for (JsonNode row : rows) {
            if (section.equals(row.get("section").asText()) && "ACCOUNT".equals(row.get("rowKind").asText())) {
                total = total.add(row.get(amountField).decimalValue());
            }
        }
        return total;
    }

    private record LineSpec(String accountCode, String debit, String credit) {
    }
}
