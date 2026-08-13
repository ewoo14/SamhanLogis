package com.samhanair.logis.accounting.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.UUID;
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
 * 자금 입출금내역 2기간 비교 보고서 IT.
 *
 * <p>실 {@link Journal}/{@link JournalLine} POSTED 분개를 시드하여 당기/직전기간 자동 산출,
 * 상대계정별 증가/감소 분해, 기초+증가-감소=기말 검산, 빈 기간 응답을 검증한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class FundsFlowComparisonControllerIT extends AbstractPostgresIT {

    private static final UUID CASH_PARTNER_ID =
            UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID COUNTER_PARTNER_ID =
            UUID.fromString("22222222-2222-2222-2222-222222222222");

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JournalRepository journalRepository;

    /** 외부 e-Tax client 격리. */
    @MockBean private ETaxClient eTaxClient;
    /** 외부 KFTC client 격리. */
    @MockBean private KftcClient kftcClient;
    /** partner-service lookup client 격리. */
    @MockBean private PartnerLookupClient partnerLookupClient;
    /** 동적 권한 client 격리. */
    @MockBean(classes = DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @Test
    @DisplayName("자금 입출금내역 — 당기/직전 동일길이 기간과 상대계정별 증감 분해를 반환")
    void fundsFlowComparisonSplitsCurrentAndPriorCounterAccounts() throws Exception {
        seedFixtures();

        MvcResult result = mockMvc.perform(get("/accounting/reports/funds-flow-comparison")
                        .param("from", "2026-06-10")
                        .param("to", "2026-06-12")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode data = objectMapper.readTree(body).get("data");
        JsonNode current = data.get("current");
        JsonNode prior = data.get("prior");

        assertText(current.get("fromDate"), "2026-06-10");
        assertText(current.get("toDate"), "2026-06-12");
        assertText(prior.get("fromDate"), "2026-06-07");
        assertText(prior.get("toDate"), "2026-06-09");

        assertAmount(findLine(current.get("increases"), "1089").get("amount"), "500.00");
        assertAmount(findLine(current.get("increases"), "1209").get("amount"), "33.33");
        assertAmount(findLine(current.get("increases"), "1469").get("amount"), "33.33");
        assertAmount(findLine(current.get("increases"), "1509").get("amount"), "33.34");
        assertAmount(findLine(current.get("increases"), "1149").get("amount"), "70.00");
        assertAmount(findLine(current.get("increases"), "9019").get("amount"), "30.00");
        assertAmount(current.get("increaseSubtotal"), "700.00");
        assertAmount(findLine(current.get("decreases"), "8029").get("amount"), "120.00");
        assertAmount(findLine(current.get("decreases"), "8249").get("amount"), "80.00");
        assertAmount(current.get("decreaseSubtotal"), "200.00");
        assertLineAbsent(current.get("increases"), "1019");
        assertLineAbsent(current.get("decreases"), "1039");
        assertLineAbsent(current.get("increases"), "UNKNOWN");
        assertLineAbsent(current.get("decreases"), "UNKNOWN");
        assertPeriodDelta(current, "500.00");
        assertReconciled(current);

        assertAmount(findLine(prior.get("increases"), "1089").get("amount"), "200.00");
        assertAmount(prior.get("increaseSubtotal"), "200.00");
        assertAmount(findLine(prior.get("decreases"), "8029").get("amount"), "50.00");
        assertAmount(prior.get("decreaseSubtotal"), "50.00");
        assertPeriodDelta(prior, "150.00");
        assertReconciled(prior);
        assertAmountEquals(current.get("openingBalance"), prior.get("closingBalance"));

        if (body.contains(CASH_PARTNER_ID.toString()) || body.contains(COUNTER_PARTNER_ID.toString())) {
            throw new AssertionError("자금 입출금내역 응답에 partner UUID 가 노출되었습니다");
        }
    }

    @Test
    @DisplayName("자금 입출금내역 — 한 분개의 다중 현금성 라인은 상대 라인을 중복 배분하지 않음")
    void fundsFlowComparisonDeduplicatesFetchedJournalLinesWithMultipleCashEquivalents() throws Exception {
        seedPosted("FUNDS-FLOW-MULTI-CASH-IN", LocalDate.of(2026, 7, 10), "다중 현금성 입금",
                line("1019", "10000000.00", "0.00", CASH_PARTNER_ID, "현금 입금"),
                line("1039", "0.00", "3000000.00", CASH_PARTNER_ID, "보통예금 내부이체"),
                line("1089", "0.00", "7000000.00", COUNTER_PARTNER_ID, "외상매출금 회수"));

        MvcResult result = mockMvc.perform(get("/accounting/reports/funds-flow-comparison")
                        .param("from", "2026-07-10")
                        .param("to", "2026-07-10")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode current = objectMapper.readTree(
                result.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("data").get("current");

        assertAmount(findLine(current.get("increases"), "1089").get("amount"), "7000000.00");
        assertAmount(current.get("increaseSubtotal"), "7000000.00");
        assertAmount(current.get("decreaseSubtotal"), "0.00");
        assertPeriodDelta(current, "7000000.00");
        assertLineAbsent(current.get("increases"), "1019");
        assertLineAbsent(current.get("increases"), "1039");
        assertLineAbsent(current.get("decreases"), "1019");
        assertLineAbsent(current.get("decreases"), "1039");
        assertLineAbsent(current.get("increases"), "UNKNOWN");
        assertReconciled(current);
    }

    @Test
    @DisplayName("자금 입출금내역 — 분개가 없는 기간은 빈 라인과 0원 검산을 반환")
    void fundsFlowComparisonReturnsEmptyPeriod() throws Exception {
        MvcResult result = mockMvc.perform(get("/accounting/reports/funds-flow-comparison")
                        .param("from", "2026-08-01")
                        .param("to", "2026-08-03")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode data = objectMapper.readTree(
                result.getResponse().getContentAsString(StandardCharsets.UTF_8)).get("data");
        JsonNode current = data.get("current");
        JsonNode prior = data.get("prior");

        assertAmount(current.get("increaseSubtotal"), "0.00");
        assertAmount(current.get("decreaseSubtotal"), "0.00");
        assertAmountEquals(current.get("openingBalance"), current.get("closingBalance"));
        assertAmountEquals(prior.get("openingBalance"), prior.get("closingBalance"));
        assertReconciled(current);

        if (current.get("increases").size() != 0 || current.get("decreases").size() != 0
                || prior.get("increases").size() != 0 || prior.get("decreases").size() != 0) {
            throw new AssertionError("빈 기간에 증감 라인이 반환되었습니다");
        }
    }

    private void seedFixtures() {
        seedPosted("FUNDS-FLOW-OPEN", LocalDate.of(2026, 6, 6), "자금 입출금 기초",
                line("102", "1000.00", "0.00", CASH_PARTNER_ID, "보통예금 기초"),
                line("301", "0.00", "1000.00", COUNTER_PARTNER_ID, "자본금"));
        seedPosted("FUNDS-FLOW-PRIOR-IN", LocalDate.of(2026, 6, 7), "직전기간 입금",
                line("102", "200.00", "0.00", CASH_PARTNER_ID, "외상매출금 회수"),
                line("110", "0.00", "200.00", COUNTER_PARTNER_ID, "외상매출금"));
        seedPosted("FUNDS-FLOW-PRIOR-OUT", LocalDate.of(2026, 6, 8), "직전기간 출금",
                line("801", "50.00", "0.00", COUNTER_PARTNER_ID, "직원급여"),
                line("102", "0.00", "50.00", CASH_PARTNER_ID, "보통예금 출금"));
        seedPosted("FUNDS-FLOW-CUR-IN", LocalDate.of(2026, 6, 10), "당기 입금",
                line("102", "500.00", "0.00", CASH_PARTNER_ID, "외상매출금 회수"),
                line("110", "0.00", "500.00", COUNTER_PARTNER_ID, "외상매출금"));
        seedPosted("FUNDS-FLOW-CUR-OUT", LocalDate.of(2026, 6, 11), "당기 출금",
                line("801", "120.00", "0.00", COUNTER_PARTNER_ID, "직원급여"),
                line("102", "0.00", "120.00", CASH_PARTNER_ID, "보통예금 출금"));
        seedPosted("FUNDS-FLOW-CUR-INTEREST", LocalDate.of(2026, 6, 12), "이자 입금",
                line("102", "30.00", "0.00", CASH_PARTNER_ID, "이자 입금"),
                line("901", "0.00", "30.00", COUNTER_PARTNER_ID, "이자수익"));
        seedPosted("FUNDS-FLOW-CUR-COMPLEX-IN", LocalDate.of(2026, 6, 12), "복합 상대 입금",
                line("102", "100.00", "0.00", CASH_PARTNER_ID, "복합 입금"),
                line("120", "0.00", "33.33", COUNTER_PARTNER_ID, "상대 대변 1"),
                line("130", "0.00", "33.33", COUNTER_PARTNER_ID, "상대 대변 2"),
                line("140", "0.00", "33.34", COUNTER_PARTNER_ID, "상대 대변 3"));
        seedPosted("FUNDS-FLOW-CUR-MIXED-INTER-CASH-IN", LocalDate.of(2026, 6, 12), "현금성 혼합 입금",
                line("102", "100.00", "0.00", CASH_PARTNER_ID, "보통예금 입금"),
                line("101", "0.00", "30.00", CASH_PARTNER_ID, "현금 내부이체"),
                line("150", "0.00", "70.00", COUNTER_PARTNER_ID, "비현금성 상대"));
        seedPosted("FUNDS-FLOW-CUR-MIXED-INTER-CASH-OUT", LocalDate.of(2026, 6, 12), "현금성 혼합 출금",
                line("850", "80.00", "0.00", COUNTER_PARTNER_ID, "비현금성 상대"),
                line("101", "20.00", "0.00", CASH_PARTNER_ID, "현금 내부이체"),
                line("102", "0.00", "100.00", CASH_PARTNER_ID, "보통예금 출금"));
        seedPosted("FUNDS-FLOW-CUR-INTER-CASH", LocalDate.of(2026, 6, 12), "현금성 내부이체",
                line("101", "0.00", "70.00", CASH_PARTNER_ID, "현금 출금"),
                line("102", "70.00", "0.00", CASH_PARTNER_ID, "보통예금 입금"));
        seedDraft("FUNDS-FLOW-DRAFT", LocalDate.of(2026, 6, 12), "미게시 제외",
                line("102", "999.00", "0.00", CASH_PARTNER_ID, "미게시"),
                line("110", "0.00", "999.00", COUNTER_PARTNER_ID, "미게시"));
    }

    private void seedPosted(String journalNo, LocalDate date, String description, LineSpec... specs) {
        Journal journal = journal(journalNo, date, description, specs);
        journal.post("funds-flow-it");
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
                    spec.partnerId(),
                    spec.memo()
            ));
        }
        return journal;
    }

    private LineSpec line(String accountCode, String debit, String credit, UUID partnerId, String memo) {
        return new LineSpec(canonicalCode(accountCode), debit, credit, partnerId, memo);
    }

    /** V101 이후 fixture도 이카운트 정본 계정으로 저장한다. */
    private String canonicalCode(String legacyCode) {
        return switch (legacyCode) {
            case "101" -> "1019";
            case "102" -> "1039";
            case "110" -> "1089";
            case "120" -> "1209";
            case "130" -> "1469";
            case "140" -> "1509";
            case "150" -> "1149";
            case "301" -> "3329";
            case "801" -> "8029";
            case "850" -> "8249";
            case "901" -> "9019";
            default -> legacyCode;
        };
    }

    private JsonNode findLine(JsonNode lines, String accountCode) {
        for (JsonNode line : lines) {
            if (accountCode.equals(line.get("counterAccountCode").asText())) {
                return line;
            }
        }
        throw new AssertionError("상대계정 라인을 찾지 못했습니다: " + accountCode);
    }

    private void assertLineAbsent(JsonNode lines, String accountCode) {
        for (JsonNode line : lines) {
            if (accountCode.equals(line.get("counterAccountCode").asText())) {
                throw new AssertionError("반환되지 않아야 할 상대계정 라인입니다: " + accountCode);
            }
        }
    }

    private void assertReconciled(JsonNode period) {
        if (!period.get("reconciled").asBoolean()) {
            throw new AssertionError("자금 입출금내역 검산이 실패했습니다: " + period);
        }
    }

    private void assertPeriodDelta(JsonNode period, String expected) {
        BigDecimal opening = period.get("openingBalance").decimalValue();
        BigDecimal closing = period.get("closingBalance").decimalValue();
        BigDecimal actualDelta = closing.subtract(opening);
        BigDecimal expectedDelta = new BigDecimal(expected);
        if (actualDelta.compareTo(expectedDelta) != 0) {
            throw new AssertionError("기간 순증감 불일치 expected=" + expectedDelta + ", actual=" + actualDelta);
        }
    }

    private void assertAmountEquals(JsonNode left, JsonNode right) {
        BigDecimal leftAmount = left.decimalValue();
        BigDecimal rightAmount = right.decimalValue();
        if (leftAmount.compareTo(rightAmount) != 0) {
            throw new AssertionError("금액 동일성 불일치 left=" + leftAmount + ", right=" + rightAmount);
        }
    }

    private void assertText(JsonNode node, String expected) {
        if (!expected.equals(node.asText())) {
            throw new AssertionError("문자열 불일치 expected=" + expected + ", actual=" + node.asText());
        }
    }

    private void assertAmount(JsonNode node, String expected) {
        BigDecimal actual = node.decimalValue();
        BigDecimal expectedAmount = new BigDecimal(expected);
        if (actual.compareTo(expectedAmount) != 0) {
            throw new AssertionError("금액 불일치 expected=" + expectedAmount + ", actual=" + actual);
        }
    }

    private record LineSpec(String accountCode, String debit, String credit, UUID partnerId, String memo) {
    }
}
