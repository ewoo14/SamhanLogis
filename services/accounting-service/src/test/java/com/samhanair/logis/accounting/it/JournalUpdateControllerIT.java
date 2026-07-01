package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
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
import com.samhanair.logis.accounting.client.SlipServiceClient;
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
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
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
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    @MockBean private DynamicPermissionClient dynamicPermissionClient;
    /** FIX 3 마감 가드 IT — POST /accounting/closings 가 내부적으로 호출하는 외부 client 격리. */
    @MockBean private SlipServiceClient slipServiceClient;

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

    @Test
    @DisplayName("PUT /accounting/journals/{id} — 헤더 동일 + 라인만 변경해도 version 이 증가하고, "
            + "직전 stale expectedVersion 재PUT 은 409 (낙관락 무력화 회귀 가드)")
    void updateLineOnlyChangeIncrementsVersionAndBlocksStalePut() throws Exception {
        JsonNode created = createJournal("40000");
        String id = created.get("id").asText();
        long staleVersion = created.get("version").asLong();
        // createBody() 고정값과 완전히 동일한 journalDate("2026-05-04")/description("테스트 분개")
        // 을 그대로 재전송 — 헤더는 dirty 하지 않고 라인 금액만 바뀌는 경로를 강제로 재현한다.

        MvcResult firstPut = mockMvc.perform(put("/accounting/journals/" + id)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(staleVersion, "2026-05-04", "테스트 분개",
                                List.of(
                                        updateLine("101", "55000", "0", null, "라인 금액만 변경"),
                                        updateLine("401", "0", "55000", null, "라인 금액만 변경 대변"))))))
                .andExpect(status().isOk())
                // 헤더가 그대로여도 응답 version 이 실제로 +1 되어야 한다(낙관락 무력화 아님).
                .andExpect(jsonPath("$.data.version").value(staleVersion + 1))
                .andReturn();
        long freshVersion = objectMapper.readTree(firstPut.getResponse().getContentAsString())
                .get("data").get("version").asLong();
        assertThat(freshVersion).isEqualTo(staleVersion + 1);

        // 직전(변경 전) stale expectedVersion 으로 재PUT → 409. (수정 전 버그: version 이 증가하지
        // 않아 이 재PUT 이 그대로 200 으로 통과하며 방금 저장한 라인 변경을 덮어썼다.)
        mockMvc.perform(put("/accounting/journals/" + id)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(staleVersion, "2026-05-04", "테스트 분개",
                                List.of(
                                        updateLine("101", "10000", "0", null, "충돌 시도"),
                                        updateLine("401", "0", "10000", null, "충돌 시도 대변"))))))
                .andExpect(status().isConflict());

        // 응답으로 돌려받은 정확한 최신 version 으로는 정상 저장된다 (응답 version 이 실제 DB 와
        // 일치함을 round-trip 으로 검증 — deferred lock 보정 누락 시 이 단계가 false-409 로 실패한다).
        mockMvc.perform(put("/accounting/journals/" + id)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(freshVersion, "2026-05-04", "테스트 분개",
                                List.of(
                                        updateLine("101", "30000", "0", null, "정상 재저장"),
                                        updateLine("401", "0", "30000", null, "정상 재저장 대변"))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.version").value(freshVersion + 1));
    }

    @Test
    @DisplayName("PUT /accounting/journals/{id} — 라인 교체는 물리 삭제 대신 markDeleted 되고, "
            + "재편집 시 동일 line_no 재사용도 충돌 없다")
    void updateSoftDeletesOldLinesAndAllowsLineNoReuseOnReedit() throws Exception {
        JsonNode created = createJournal("45000");
        String id = created.get("id").asText();
        long version = created.get("version").asLong();
        String firstLineId = created.get("lines").get(0).get("lineId").asText();

        MvcResult firstPut = mockMvc.perform(put("/accounting/journals/" + id)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(version, "2026-05-04", "1차 라인 교체",
                                List.of(
                                        updateLine("102", "20000", "0", null, "1차 신규 차변"),
                                        updateLine("401", "0", "20000", null, "1차 신규 대변"))))))
                .andExpect(status().isOk())
                .andReturn();
        long v1 = objectMapper.readTree(firstPut.getResponse().getContentAsString())
                .get("data").get("version").asLong();

        // 교체된(구) 라인은 물리 삭제가 아니라 is_deleted=true 로 DB 에 잔존해야 한다.
        Integer softDeletedCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM journal_lines WHERE id = ? AND is_deleted = TRUE",
                Integer.class, UUID.fromString(firstLineId));
        assertThat(softDeletedCount).isEqualTo(1);

        // 2차 PUT — line_no(1,2) 를 다시 사용해도 partial UNIQUE(V49) 덕에 충돌 없이 저장된다.
        mockMvc.perform(put("/accounting/journals/" + id)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(v1, "2026-05-04", "2차 라인 교체",
                                List.of(
                                        updateLine("103", "25000", "0", null, "2차 신규 차변"),
                                        updateLine("401", "0", "25000", null, "2차 신규 대변"))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines.length()").value(2))
                .andExpect(jsonPath("$.data.lines[0].lineNo").value(1))
                .andExpect(jsonPath("$.data.lines[1].lineNo").value(2));
    }

    @Test
    @DisplayName("PUT /accounting/journals/{id} — CLOSED 회계 기간 journalDate 는 409 (마감 가드)")
    void updateBlockedByClosedPeriod() throws Exception {
        Mockito.when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any())).thenReturn(0);

        JsonNode created = createJournal("15000");
        String id = created.get("id").asText();
        long version = created.get("version").asLong();

        // createBody() 고정 journalDate("2026-05-04") 를 DAILY 마감 처리.
        Map<String, Object> closingBody = new HashMap<>();
        closingBody.put("periodType", "DAILY");
        closingBody.put("periodDate", "2026-05-04");
        mockMvc.perform(post("/accounting/closings")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(closingBody)))
                .andExpect(status().isCreated());

        mockMvc.perform(put("/accounting/journals/" + id)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(version, "2026-05-04", "마감 후 수정 시도",
                                List.of(
                                        updateLine("101", "15000", "0", null, "차변"),
                                        updateLine("401", "0", "15000", null, "대변"))))))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("PUT /accounting/journals/{id} — 라인 partnerId 가 보존된다")
    void updatePreservesLinePartnerId() throws Exception {
        JsonNode created = createJournal("70000");
        String id = created.get("id").asText();
        long version = created.get("version").asLong();
        UUID partnerId = UUID.randomUUID();

        Map<String, Object> debitLine = new HashMap<>();
        debitLine.put("accountCode", "102");
        debitLine.put("debit", new BigDecimal("70000"));
        debitLine.put("credit", BigDecimal.ZERO);
        debitLine.put("partnerId", partnerId.toString());
        debitLine.put("partnerName", "거래처B");
        debitLine.put("memo", "partnerId 보존 확인");

        mockMvc.perform(put("/accounting/journals/" + id)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(version, "2026-05-04", "partnerId 보존 확인",
                                List.of(debitLine, updateLine("401", "0", "70000", null, "대변"))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines[0].partnerId").value(partnerId.toString()))
                .andExpect(jsonPath("$.data.lines[0].partnerName").value("거래처B"));
    }

    @Test
    @DisplayName("PUT /accounting/journals/{id} — 라인 note 키도 memo 로 매핑된다 (JsonAlias)")
    void updateAcceptsNoteAliasForMemo() throws Exception {
        JsonNode created = createJournal("25000");
        String id = created.get("id").asText();
        long version = created.get("version").asLong();

        Map<String, Object> debitLine = new HashMap<>();
        debitLine.put("accountCode", "102");
        debitLine.put("debit", new BigDecimal("25000"));
        debitLine.put("credit", BigDecimal.ZERO);
        debitLine.put("note", "note 키로 전달된 메모");

        mockMvc.perform(put("/accounting/journals/" + id)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(version, "2026-05-04", "note alias 검증",
                                List.of(debitLine, updateLine("401", "0", "25000", null, "대변"))))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.lines[0].memo").value("note 키로 전달된 메모"));
    }

    @Test
    @DisplayName("PUT /accounting/journals/{id} — accountCode 6자 초과는 400")
    void updateRejectsAccountCodeOverSixChars() throws Exception {
        JsonNode created = createJournal("5000");
        String id = created.get("id").asText();
        long version = created.get("version").asLong();

        mockMvc.perform(put("/accounting/journals/" + id)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(version, "2026-05-04", "accountCode 검증",
                                List.of(
                                        updateLine("1234567", "5000", "0", null, "7자리 계정코드"),
                                        updateLine("401", "0", "5000", null, "대변"))))))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("PUT /accounting/journals/{id} — 존재하지 않는 분개 오류 메시지는 UUID 를 노출하지 않는다")
    void updateMissingJournalDoesNotExposeUuidInErrorMessage() throws Exception {
        String missingId = UUID.randomUUID().toString();

        MvcResult result = mockMvc.perform(put("/accounting/journals/" + missingId)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody(0L, "2026-05-04", "존재하지 않는 분개",
                                List.of(
                                        updateLine("101", "5000", "0", null, "차변"),
                                        updateLine("401", "0", "5000", null, "대변"))))))
                .andExpect(status().isNotFound())
                .andReturn();

        JsonNode error = objectMapper.readTree(result.getResponse().getContentAsByteArray());
        assertThat(error.get("message").asText()).isEqualTo("존재하지 않는 분개입니다");
        assertThat(error.get("message").asText()).doesNotContain(missingId);
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
