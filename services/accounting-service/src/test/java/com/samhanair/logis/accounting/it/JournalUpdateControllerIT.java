package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeResult;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
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

/** Journal DRAFT direct PUT 수정 endpoint IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class JournalUpdateControllerIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUpExternalClients() {
        lenient().when(partnerLookupClient.findByPartnerId(any())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerCode(any())).thenReturn(Optional.empty());
        lenient().when(approvalLineAuthorizeClient.authorize(any(), any(), any()))
                .thenReturn(new ApprovalLineAuthorizeResult(false, false));
    }

    @Test
    @DisplayName("PUT /accounting/journals/{id} — DRAFT 헤더와 라인을 전체 교체한다")
    void updateDraftJournalReplacesHeaderAndLines() throws Exception {
        JsonNode created = createJournal("100000");
        String id = created.get("id").asText();
        long version = created.get("version").asLong();

        mockMvc.perform(put("/accounting/journals/" + id)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(version, "2026-05-05", "수정 분개",
                                List.of(
                                        updateLine("102", "120000", "0", "거래처A", "보통예금 입금"),
                                        updateLine("401", "0", "120000", null, "매출 대체"))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.journalDate").value("2026-05-05"))
                .andExpect(jsonPath("$.data.description").value("수정 분개"))
                .andExpect(jsonPath("$.data.totalDebit").value(120000))
                .andExpect(jsonPath("$.data.totalCredit").value(120000))
                .andExpect(jsonPath("$.data.version").value(version + 1))
                .andExpect(jsonPath("$.data.lines.length()").value(2))
                .andExpect(jsonPath("$.data.lines[0].accountCode").value("102"))
                .andExpect(jsonPath("$.data.lines[0].debitAmount").value(120000))
                .andExpect(jsonPath("$.data.lines[0].partnerName").value("거래처A"))
                .andExpect(jsonPath("$.data.lines[0].memo").value("보통예금 입금"))
                .andExpect(jsonPath("$.data.lines[1].accountCode").value("401"));
    }

    @Test
    @DisplayName("PUT /accounting/journals/{id} — POSTED 분개는 409 CONFLICT")
    void updatePostedJournalReturnsConflict() throws Exception {
        JsonNode created = createJournal("80000");
        String id = created.get("id").asText();
        long version = created.get("version").asLong();

        mockMvc.perform(post("/accounting/journals/" + id + "/post")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());

        mockMvc.perform(put("/accounting/journals/" + id)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(version, "2026-05-05", "수정 불가",
                                List.of(
                                        updateLine("102", "80000", "0", null, "차변"),
                                        updateLine("401", "0", "80000", null, "대변"))))))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("PUT /accounting/journals/{id} — expectedVersion 불일치 시 409 CONFLICT")
    void updateVersionMismatchReturnsConflict() throws Exception {
        JsonNode created = createJournal("60000");
        String id = created.get("id").asText();

        mockMvc.perform(put("/accounting/journals/" + id)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(99L, "2026-05-05", "stale",
                                List.of(
                                        updateLine("102", "60000", "0", null, "차변"),
                                        updateLine("401", "0", "60000", null, "대변"))))))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("PUT /accounting/journals/{id} — 라인 추가/삭제가 전체 교체로 반영된다")
    void updateLineReplacementAddsAndRemovesLines() throws Exception {
        JsonNode created = createJournal("90000");
        String id = created.get("id").asText();
        long version = created.get("version").asLong();
        String removedLineId = created.get("lines").get(0).get("lineId").asText();

        mockMvc.perform(put("/accounting/journals/" + id)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(version, "2026-05-04", "3라인 교체",
                                List.of(
                                        updateLine("102", "40000", "0", null, "신규 차변 1"),
                                        updateLine("103", "50000", "0", null, "신규 차변 2"),
                                        updateLine("401", "0", "90000", null, "신규 대변"))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines.length()").value(3))
                .andExpect(jsonPath("$.data.lines[0].lineNo").value(1))
                .andExpect(jsonPath("$.data.lines[1].lineNo").value(2))
                .andExpect(jsonPath("$.data.lines[2].lineNo").value(3));

        mockMvc.perform(get("/accounting/journals/" + id)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines[?(@.lineId=='" + removedLineId + "')]").isEmpty());
    }

    @Test
    @DisplayName("PUT /accounting/journals/{id} — DRAFT 저장은 차대 불균형을 허용한다")
    void updateAllowsUnbalancedDraft() throws Exception {
        JsonNode created = createJournal("50000");
        String id = created.get("id").asText();
        long version = created.get("version").asLong();

        mockMvc.perform(put("/accounting/journals/" + id)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(version, "2026-05-04", "불균형 임시저장",
                                List.of(
                                        updateLine("102", "50000", "0", null, "차변만 수정"),
                                        updateLine("401", "0", "40000", null, "대변 임시"))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andExpect(jsonPath("$.data.totalDebit").value(50000))
                .andExpect(jsonPath("$.data.totalCredit").value(40000));
    }

    private JsonNode createJournal(String amount) throws Exception {
        MvcResult result = mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createBody(amount))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("data");
    }

    private Map<String, Object> createBody(String amount) {
        Map<String, Object> debitLine = new HashMap<>();
        debitLine.put("accountCode", "101");
        debitLine.put("debitAmount", new BigDecimal(amount));
        debitLine.put("creditAmount", BigDecimal.ZERO);
        debitLine.put("memo", "현금 입금");

        Map<String, Object> creditLine = new HashMap<>();
        creditLine.put("accountCode", "401");
        creditLine.put("debitAmount", BigDecimal.ZERO);
        creditLine.put("creditAmount", new BigDecimal(amount));
        creditLine.put("memo", "상품매출");

        Map<String, Object> body = new HashMap<>();
        body.put("journalDate", "2026-05-04");
        body.put("description", "테스트 분개");
        body.put("lines", List.of(debitLine, creditLine));
        return body;
    }

    private Map<String, Object> updateBody(long expectedVersion, String journalDate,
                                           String description, List<Map<String, Object>> lines) {
        Map<String, Object> body = new HashMap<>();
        body.put("expectedVersion", expectedVersion);
        body.put("journalDate", journalDate);
        body.put("description", description);
        body.put("lines", lines);
        return body;
    }

    private Map<String, Object> updateLine(String accountCode, String debit, String credit,
                                           String partnerName, String memo) {
        Map<String, Object> line = new HashMap<>();
        line.put("accountCode", accountCode);
        line.put("debit", new BigDecimal(debit));
        line.put("credit", new BigDecimal(credit));
        line.put("partnerName", partnerName);
        line.put("memo", memo);
        return line;
    }
}
