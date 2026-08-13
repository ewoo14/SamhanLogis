package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.eq;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeResult;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.PartnerLedgerSalesClient;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * TrialBalanceController IT — period 별 시산표 집계 검증.
 *
 * <p>시나리오: ACCOUNTANT 가 분개 1건 생성 → POST → 같은 월 시산표 조회 시 라인 집계 확인.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class TrialBalanceControllerIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    /** SP-09-1 e-Tax client 격리 — Phase 11 NTS 전환 시 IT 실 API 호출 방지 (D2). */
    @MockBean private ETaxClient eTaxClient;
    /** SP-09-4 KFTC 오픈뱅킹 client 격리 — Phase 11 sandbox 전환 시 IT 실 API 호출 방지. */
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    /** R41 원장 read model의 slip-service 경계 격리 — 시산표는 이 client를 소비하지 않는다. */
    @MockBean private PartnerLedgerSalesClient partnerLedgerSalesClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    @MockBean private ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    /**
     * SP-D2 동적 권한 client 격리. SP-D5 cycle 2 fix (P1-4): {@code @RequirePermission} AOP 가
     * 본 IT 의 report endpoint 호출 시 canView=false 로 회귀하지 않도록 lenient stub 적용.
     */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUpPermissionStub() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(approvalLineAuthorizeClient.authorize(any(), any(), any()))
                .thenReturn(new ApprovalLineAuthorizeResult(false, false));
        lenient().when(partnerLookupClient.findByPartnerCode("P-TB-REV"))
                .thenReturn(Optional.of(new PartnerSummary(
                        UUID.fromString("00000000-0000-0000-0000-00000000c710"),
                        "P-TB-REV",
                        "리포트역분개상사",
                        "123-45-67890",
                        "서울")));
        lenient().when(partnerLedgerSalesClient.find(any(), any(), any(), any())).thenReturn(List.of());
        lenient().when(chatRoomMappingClient.findChatRoomNamesByPartnerCode(anyString())).thenReturn(List.of());
    }

    @Test
    @DisplayName("POSTED 분개 1건 생성 후 시산표에 101/401 집계")
    void postedJournalShowsInTrialBalance() throws Exception {
        // 분개 생성
        Map<String, Object> body = balancedJournalBody("123000");
        MvcResult create = mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String id = objectMapper.readTree(create.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // POST
        mockMvc.perform(post("/accounting/journals/" + id + "/post")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());

        // 시산표 조회 (202605)
        mockMvc.perform(get("/accounting/balances")
                        .param("period", "202605")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalDebit").value(123000))
                .andExpect(jsonPath("$.data.totalCredit").value(123000))
                .andExpect(jsonPath("$.data.rows.length()").value(2));
    }

    @Test
    @DisplayName("DRAFT 분개는 시산표에 미포함")
    void draftJournalExcluded() throws Exception {
        Map<String, Object> body = balancedJournalBody("99999");
        mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());

        // 시산표 — POSTED 가 아닌 DRAFT 만 있으므로 0 합계
        mockMvc.perform(get("/accounting/balances")
                        .param("period", "202605")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalDebit").value(0))
                .andExpect(jsonPath("$.data.totalCredit").value(0));
    }

    @Test
    @DisplayName("권한 — SALES 시산표 조회 403")
    void salesForbidden() throws Exception {
        denyRequirePermission("accounting.balances", PermissionAction.VIEW);
        lenient().when(dynamicPermissionClient.canView(eq("SALES"), anyString())).thenReturn(false);
        mockMvc.perform(get("/accounting/balances")
                        .param("period", "202605")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("period 형식 오류 — 400")
    void invalidPeriodReturns400() throws Exception {
        mockMvc.perform(get("/accounting/balances")
                        .param("period", "2026-05")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("합계잔액시산표 — 이월/기간/4컬럼/균형 및 다중 라인 계정 집계")
    void trialBalanceSummaryAggregatesOpeningAndEcountColumns() throws Exception {
        createAndPostJournal("2024-12-31", List.of(
                line("1019", "1000", "0"),
                line("3329", "0", "1000")
        ));
        createAndPostJournal("2025-01-05", List.of(
                line("1019", "500", "0"),
                line("8029", "300", "0"),
                line("1019", "200", "0"),
                line("2519", "0", "400"),
                line("4019", "0", "600")
        ));

        MvcResult result = mockMvc.perform(get("/accounting/reports/trial-balance/summary")
                        .param("from", "2025-01-01")
                        .param("to", "2025-01-31")
                        .param("granularity", "MONTH")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fromDate").value("2025-01-01"))
                .andExpect(jsonPath("$.data.toDate").value("2025-01-31"))
                .andExpect(jsonPath("$.data.granularity").value("MONTH"))
                .andExpect(jsonPath("$.data.totals.debitTotal").value(1000))
                .andExpect(jsonPath("$.data.totals.creditTotal").value(1000))
                .andExpect(jsonPath("$.data.totals.balanced").value(true))
                .andReturn();

        JsonNode rows = objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data").get("rows");
        assertThat(rows).hasSize(5);

        JsonNode cash = row(rows, "1019");
        assertThat(amount(cash, "openingBalance")).isEqualByComparingTo("1000.00");
        assertThat(amount(cash, "debitTotal")).isEqualByComparingTo("700.00");
        assertThat(amount(cash, "creditTotal")).isEqualByComparingTo("0");
        assertThat(amount(cash, "debitBalance")).isEqualByComparingTo("1700.00");
        assertThat(amount(cash, "creditBalance")).isEqualByComparingTo("0");

        JsonNode payable = row(rows, "2519");
        assertThat(amount(payable, "debitBalance")).isEqualByComparingTo("0");
        assertThat(amount(payable, "creditBalance")).isEqualByComparingTo("400.00");

        JsonNode capital = row(rows, "3329");
        assertThat(amount(capital, "openingBalance")).isEqualByComparingTo("1000.00");
        assertThat(amount(capital, "creditBalance")).isEqualByComparingTo("1000.00");
    }

    @Test
    @DisplayName("합계잔액시산표 — 차변성 계정 음수 기말잔액은 대변잔액 컬럼에 양수 표시")
    void trialBalanceSummaryPlacesNegativeAssetClosingOnCreditBalance() throws Exception {
        createAndPostJournal("2025-02-10", List.of(
                line("8029", "500", "0"),
                line("1019", "0", "500")
        ));

        MvcResult result = mockMvc.perform(get("/accounting/reports/trial-balance/summary")
                        .param("from", "2025-02-01")
                        .param("to", "2025-02-28")
                        .param("granularity", "MONTH")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totals.debitTotal").value(500))
                .andExpect(jsonPath("$.data.totals.creditTotal").value(500))
                .andExpect(jsonPath("$.data.totals.debitBalanceTotal").value(500))
                .andExpect(jsonPath("$.data.totals.creditBalanceTotal").value(500))
                .andExpect(jsonPath("$.data.totals.balanced").value(true))
                .andReturn();

        JsonNode rows = objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data").get("rows");
        assertThat(rows).hasSize(2);

        JsonNode cash = row(rows, "1019");
        assertThat(amount(cash, "closingBalance")).isEqualByComparingTo("-500.00");
        assertThat(amount(cash, "debitBalance")).isEqualByComparingTo("0");
        assertThat(amount(cash, "creditBalance")).isEqualByComparingTo("500.00");

        JsonNode salary = row(rows, "8029");
        assertThat(amount(salary, "debitBalance")).isEqualByComparingTo("500.00");
        assertThat(amount(salary, "creditBalance")).isEqualByComparingTo("0");
    }

    @Test
    @DisplayName("리포트 전층은 REVERSED 원분개와 POSTED 역분개를 함께 읽어 잔액을 상쇄한다")
    void reportsIncludeReversedCompensationPair() throws Exception {
        UUID partnerId = UUID.fromString("00000000-0000-0000-0000-00000000c710");
        MvcResult baselineSummary = mockMvc.perform(get("/accounting/reports/trial-balance/summary")
                        .param("from", "2099-03-01")
                        .param("to", "2099-03-31")
                        .param("granularity", "MONTH")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();
        BigDecimal baselineReceivableClosing = amount(row(
                objectMapper.readTree(baselineSummary.getResponse().getContentAsString())
                        .get("data").get("rows"), "1089"), "closingBalance");

        String journalId = createAndPostJournal("2099-03-15", List.of(
                lineWithPartner("1089", "777", "0", partnerId),
                line("4019", "0", "777")
        ));

        mockMvc.perform(post("/accounting/journals/" + journalId + "/reverse")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.description").value(org.hamcrest.Matchers.containsString("[역분개]")))
                .andExpect(jsonPath("$.data.description").value(org.hamcrest.Matchers.containsString("2099/03/15-")));

        MvcResult trialBalance = mockMvc.perform(get("/accounting/balances")
                        .param("period", "209903")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode trialRows = objectMapper.readTree(trialBalance.getResponse().getContentAsString())
                .get("data").get("rows");
        assertThat(amount(row(trialRows, "1089"), "balance")).isEqualByComparingTo("0");
        assertThat(amount(row(trialRows, "4019"), "balance")).isEqualByComparingTo("0");

        MvcResult summary = mockMvc.perform(get("/accounting/reports/trial-balance/summary")
                        .param("from", "2099-03-01")
                        .param("to", "2099-03-31")
                        .param("granularity", "MONTH")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode summaryRows = objectMapper.readTree(summary.getResponse().getContentAsString())
                .get("data").get("rows");
        JsonNode receivable = row(summaryRows, "1089");
        assertThat(amount(receivable, "debitTotal")).isEqualByComparingTo("777");
        assertThat(amount(receivable, "creditTotal")).isEqualByComparingTo("777");
        assertThat(amount(receivable, "closingBalance")).isEqualByComparingTo(baselineReceivableClosing);

        MvcResult ledger = mockMvc.perform(get("/accounting/journals/ledger-data")
                        .param("partnerCode", "P-TB-REV")
                        .param("from", "2099-03-01")
                        .param("to", "2099-03-31")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode ledgerLines = objectMapper.readTree(ledger.getResponse().getContentAsString())
                .get("data").get("lines");
        assertThat(ledgerLines).hasSize(2);
        assertThat(amount(ledgerLines.get(ledgerLines.size() - 1), "balance")).isEqualByComparingTo("0");
    }

    @Test
    @DisplayName("거래처 원장 — 기간 밖 원분개/역분개도 기간 내와 동일한 전체 전표 계약으로 기초 상쇄")
    void partnerLedgerOpeningUsesFullJournalCollectionContract() throws Exception {
        UUID partnerId = UUID.fromString("00000000-0000-0000-0000-00000000c711");
        String partnerCode = "P-TB-BOUNDARY";
        lenient().when(partnerLookupClient.findByPartnerCode(partnerCode))
                .thenReturn(Optional.of(new PartnerSummary(
                        partnerId, partnerCode, "기간경계 거래처", "123-45-67890", "서울")));

        String originalId = createAndPostJournal("2099-04-15", List.of(
                lineWithPartner("1089", "777", "0", partnerId),
                line("4019", "0", "777")
        ));
        mockMvc.perform(post("/accounting/journals/" + originalId + "/reverse")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
        createAndPostJournal("2099-05-05", List.of(
                lineWithPartner("1089", "1", "0", partnerId),
                line("4019", "0", "1")
        ));

        mockMvc.perform(get("/accounting/journals/partner-ledger")
                        .param("partnerCode", partnerCode)
                        .param("from", "2099-05-01")
                        .param("to", "2099-05-31")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.openingBalance").value(0))
                .andExpect(jsonPath("$.data.salesTotal").value(1))
                .andExpect(jsonPath("$.data.closingBalance").value(1));
    }

    @Test
    @DisplayName("거래처 원장 — 한 전표의 거래처별 110 금액을 각 거래처에만 귀속")
    void partnerLedgerAttributesMultiPartnerJournalByLinePartner() throws Exception {
        UUID partnerAId = UUID.fromString("00000000-0000-0000-0000-00000000c712");
        UUID partnerBId = UUID.fromString("00000000-0000-0000-0000-00000000c713");
        String partnerACode = "P-TB-MULTI-A";
        String partnerBCode = "P-TB-MULTI-B";
        lenient().when(partnerLookupClient.findByPartnerCode(partnerACode))
                .thenReturn(Optional.of(new PartnerSummary(
                        partnerAId, partnerACode, "다중 거래처 A", "123-45-67891", "서울")));
        lenient().when(partnerLookupClient.findByPartnerCode(partnerBCode))
                .thenReturn(Optional.of(new PartnerSummary(
                        partnerBId, partnerBCode, "다중 거래처 B", "123-45-67892", "서울")));

        createAndPostJournal("2099-06-10", List.of(
                lineWithPartner("1089", "100", "0", partnerAId),
                lineWithPartner("1089", "200", "0", partnerBId),
                line("4019", "0", "300")
        ));

        mockMvc.perform(get("/accounting/journals/partner-ledger")
                        .param("partnerCode", partnerACode)
                        .param("from", "2099-06-01")
                        .param("to", "2099-06-30")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.salesTotal").value(100))
                .andExpect(jsonPath("$.data.closingBalance").value(100));

        mockMvc.perform(get("/accounting/journals/partner-ledger")
                        .param("partnerCode", partnerBCode)
                        .param("from", "2099-06-01")
                        .param("to", "2099-06-30")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.salesTotal").value(200))
                .andExpect(jsonPath("$.data.closingBalance").value(200));
    }

    private Map<String, Object> balancedJournalBody(String amount) {
        Map<String, Object> debitLine = new HashMap<>();
        debitLine.put("accountCode", "1019");
        debitLine.put("debitAmount", new BigDecimal(amount));
        debitLine.put("creditAmount", BigDecimal.ZERO);

        Map<String, Object> creditLine = new HashMap<>();
        creditLine.put("accountCode", "4019");
        creditLine.put("debitAmount", BigDecimal.ZERO);
        creditLine.put("creditAmount", new BigDecimal(amount));

        Map<String, Object> body = new HashMap<>();
        body.put("journalDate", "2026-05-15");
        body.put("description", "테스트 분개");
        body.put("lines", List.of(debitLine, creditLine));
        return body;
    }

    private String createAndPostJournal(String journalDate, List<Map<String, Object>> lines) throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("journalDate", journalDate);
        body.put("description", "합계잔액시산표 테스트 분개");
        body.put("lines", lines);

        MvcResult create = mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String id = objectMapper.readTree(create.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(post("/accounting/journals/" + id + "/post")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
        return id;
    }

    private Map<String, Object> line(String accountCode, String debitAmount, String creditAmount) {
        Map<String, Object> line = new HashMap<>();
        line.put("accountCode", accountCode);
        line.put("debitAmount", new BigDecimal(debitAmount));
        line.put("creditAmount", new BigDecimal(creditAmount));
        return line;
    }

    private Map<String, Object> lineWithPartner(String accountCode, String debitAmount,
                                                String creditAmount, UUID partnerId) {
        Map<String, Object> line = line(accountCode, debitAmount, creditAmount);
        line.put("partnerId", partnerId);
        return line;
    }

    private JsonNode row(JsonNode rows, String accountCode) {
        for (JsonNode row : rows) {
            if (accountCode.equals(row.get("accountCode").asText())) {
                return row;
            }
        }
        throw new AssertionError("accountCode not found: " + accountCode);
    }

    private BigDecimal amount(JsonNode row, String fieldName) {
        return row.get(fieldName).decimalValue();
    }
}
