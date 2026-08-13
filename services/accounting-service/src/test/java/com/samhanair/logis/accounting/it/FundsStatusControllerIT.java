package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.domain.Journal;
import com.samhanair.logis.accounting.domain.JournalLine;
import com.samhanair.logis.accounting.domain.JournalSourceType;
import com.samhanair.logis.accounting.repository.JournalRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
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
 * 자금현황 보고서 IT.
 *
 * <p>실 {@link Journal}/{@link JournalLine} POSTED 분개를 시드하여 자산/부채 자금 계정의
 * 이월/증가/감소/금일잔액 부호 규칙과 drill-down 상대 라인 조회를 검증한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class FundsStatusControllerIT extends AbstractPostgresIT {

    private static final UUID CASH_PARTNER_ID =
            UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID LOAN_PARTNER_ID =
            UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final UUID COUNTER_PARTNER_ID =
            UUID.fromString("33333333-3333-3333-3333-333333333333");

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

    @BeforeEach
    void setUpPartnerLookup() {
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(anyList()))
                .thenAnswer(invocation -> {
                    @SuppressWarnings("unchecked")
                    List<UUID> ids = invocation.getArgument(0, List.class);
                    Map<UUID, PartnerSummary> names = new HashMap<>();
                    if (ids.contains(CASH_PARTNER_ID)) {
                        names.put(CASH_PARTNER_ID,
                                new PartnerSummary(CASH_PARTNER_ID, "P-FUND-001", "국민은행 운영계좌", "111-22-33333", null));
                    }
                    if (ids.contains(LOAN_PARTNER_ID)) {
                        names.put(LOAN_PARTNER_ID,
                                new PartnerSummary(LOAN_PARTNER_ID, "P-FUND-002", "기업은행 차입금", "222-33-44444", null));
                    }
                    if (ids.contains(COUNTER_PARTNER_ID)) {
                        names.put(COUNTER_PARTNER_ID,
                                new PartnerSummary(COUNTER_PARTNER_ID, "P-FUND-003", "삼한거래처", "333-44-55555", null));
                    }
                    return names;
                });
    }

    @Test
    @DisplayName("자금현황 — ASSET/Liability 부호와 이월+증가-감소=금일잔액 검산")
    void fundsStatusComputesAssetAndLiabilitySigns() throws Exception {
        seedFixtures();

        MvcResult result = mockMvc.perform(get("/accounting/reports/funds-status")
                        .param("from", "2026-06-01")
                        .param("to", "2026-06-30")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode data = objectMapper.readTree(body).get("data");

        JsonNode cashLine = findLine(data, "1039", "국민은행 운영계좌");
        if (!"1112233333".equals(cashLine.get("bizNo").asText())) {
            throw new AssertionError("자금현황 거래처코드(bizNo)가 예상과 다릅니다: " + cashLine.get("bizNo").asText());
        }
        assertAmount(cashLine.get("openingBalance"), "10000.00");
        assertAmount(cashLine.get("increase"), "4000.00");
        assertAmount(cashLine.get("decrease"), "1000.00");
        assertAmount(cashLine.get("closingBalance"), "13000.00");

        JsonNode loanLine = findLine(data, "2515", "기업은행 차입금");
        assertAmount(loanLine.get("openingBalance"), "20000.00");
        assertAmount(loanLine.get("increase"), "5000.00");
        assertAmount(loanLine.get("decrease"), "2000.00");
        assertAmount(loanLine.get("closingBalance"), "23000.00");

        if (body.contains(CASH_PARTNER_ID.toString()) || body.contains(LOAN_PARTNER_ID.toString())) {
            throw new AssertionError("자금현황 응답에 partner UUID 가 노출되었습니다");
        }
    }

    @Test
    @DisplayName("자금 증가 상세 — 대상 계정 증가 라인과 같은 전표의 상대 라인을 반환")
    void increaseDetailReturnsCounterLine() throws Exception {
        seedFixtures();

        MvcResult result = mockMvc.perform(get("/accounting/reports/funds-status/increase-detail")
                        .param("from", "2026-06-01")
                        .param("to", "2026-06-30")
                        .param("accountCode", "1039")
                        .param("partnerId", CASH_PARTNER_ID.toString())
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        String body = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        JsonNode data = objectMapper.readTree(body).get("data");

        assertAmount(data.get("totalAmount"), "4000.00");
        if (data.get("lines").size() != 1) {
            throw new AssertionError("증가 상세 라인 수가 예상과 다릅니다: " + data.get("lines").size());
        }
        JsonNode line = data.get("lines").get(0);
        if (!"2026-06-10".equals(line.get("txDate").asText())) {
            throw new AssertionError("거래일자가 예상과 다릅니다: " + line.get("txDate").asText());
        }
        if (!"외상매출금".equals(line.get("counterAccountName").asText())) {
            throw new AssertionError("상대계정명이 예상과 다릅니다: " + line.get("counterAccountName").asText());
        }
        if (!"삼한거래처".equals(line.get("counterPartnerName").asText())) {
            throw new AssertionError("상대거래처명이 예상과 다릅니다: " + line.get("counterPartnerName").asText());
        }
        assertAmount(line.get("amount"), "4000.00");

        if (body.contains(CASH_PARTNER_ID.toString()) || body.contains(COUNTER_PARTNER_ID.toString())) {
            throw new AssertionError("증가 상세 응답에 partner UUID 가 노출되었습니다");
        }
    }

    private void seedFixtures() {
        seedPosted("FUNDS-OPEN-ASSET", LocalDate.of(2026, 5, 31), "보통예금 이월",
                line("1039", "10000.00", "0.00", CASH_PARTNER_ID, "국민은행 이월"),
                line("4019", "0.00", "10000.00", COUNTER_PARTNER_ID, "전기 매출"));
        seedPosted("FUNDS-OPEN-LIABILITY", LocalDate.of(2026, 5, 31), "단기차입금 이월",
                line("5019", "20000.00", "0.00", COUNTER_PARTNER_ID, "전기 비용"),
                line("2515", "0.00", "20000.00", LOAN_PARTNER_ID, "기업은행 차입"));
        seedPosted("FUNDS-ASSET-INCREASE", LocalDate.of(2026, 6, 10), "자금 증가",
                line("1039", "4000.00", "0.00", CASH_PARTNER_ID, "국민은행 입금"),
                line("1089", "0.00", "4000.00", COUNTER_PARTNER_ID, "외상매출금 회수"));
        seedPosted("FUNDS-ASSET-DECREASE", LocalDate.of(2026, 6, 11), "자금 감소",
                line("801", "1000.00", "0.00", COUNTER_PARTNER_ID, "지급수수료"),
                line("1039", "0.00", "1000.00", CASH_PARTNER_ID, "국민은행 출금"));
        seedPosted("FUNDS-LIABILITY-INCREASE", LocalDate.of(2026, 6, 12), "차입 증가",
                line("1089", "5000.00", "0.00", COUNTER_PARTNER_ID, "차입 상대"),
                line("2515", "0.00", "5000.00", LOAN_PARTNER_ID, "기업은행 추가 차입"));
        seedPosted("FUNDS-LIABILITY-DECREASE", LocalDate.of(2026, 6, 13), "차입 감소",
                line("2515", "2000.00", "0.00", LOAN_PARTNER_ID, "기업은행 상환"),
                line("1089", "0.00", "2000.00", COUNTER_PARTNER_ID, "상환 상대"));
        seedDraft("FUNDS-DRAFT-IGNORED", LocalDate.of(2026, 6, 14), "미게시 제외",
                line("1039", "999.00", "0.00", CASH_PARTNER_ID, "미게시 입금"),
                line("4019", "0.00", "999.00", COUNTER_PARTNER_ID, "미게시 매출"));
    }

    private void seedPosted(String journalNo, LocalDate date, String description, LineSpec... specs) {
        Journal journal = journal(journalNo, date, description, specs);
        journal.post("funds-it");
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
        return new LineSpec(accountCode, debit, credit, partnerId, memo);
    }

    private JsonNode findLine(JsonNode data, String accountCode, String partnerName) {
        for (JsonNode group : data.get("groups")) {
            for (JsonNode account : group.get("accounts")) {
                for (JsonNode line : account.get("lines")) {
                    if (accountCode.equals(line.get("accountCode").asText())
                            && partnerName.equals(line.get("partnerName").asText())) {
                        return line;
                    }
                }
            }
        }
        throw new AssertionError("자금현황 라인을 찾지 못했습니다: " + accountCode + " / " + partnerName);
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
