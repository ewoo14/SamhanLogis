package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeResult;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.HashMap;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/** CashReceipt 수기 CRUD + 상태 라이프사이클 IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class CashReceiptControllerIT extends AbstractPostgresIT {

    private static final String BASE_URL = "/accounting/cash-receipts";
    private static final String ACCOUNTANT_ID = "00000000-0000-0000-0000-000000000104";
    private static final UUID PARTNER_ID = UUID.fromString("10000000-0000-0000-0000-000000000001");

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private EntityManager entityManager;

    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    @MockBean(classes = DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUpExternalClients() {
        lenient().when(partnerLookupClient.findByPartnerId(any())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerCode(any())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(any()))
                .thenReturn(Map.of(PARTNER_ID, new PartnerSummary(
                        PARTNER_ID, "P-CR-001", "삼한입금상사", "123-45-67890", "서울")));
        lenient().when(approvalLineAuthorizeClient.authorize(any(), any(), any()))
                .thenReturn(new ApprovalLineAuthorizeResult(false, false));
    }

    @Test
    @DisplayName("수기 입금보고서 CRUD와 상태전이 — 생성/조회/수정/확정/수정거부/취소")
    void manualCashReceiptLifecycle() throws Exception {
        MvcResult created = mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createBody("120000"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andExpect(jsonPath("$.data.kind").value("MANUAL_RECEIPT"))
                .andExpect(jsonPath("$.data.debitAccountCode").value("103"))
                .andExpect(jsonPath("$.data.creditAccountCode").value("110"))
                .andExpect(jsonPath("$.data.journalId").doesNotExist())
                .andExpect(jsonPath("$.data.journalNo").doesNotExist())
                .andExpect(jsonPath("$.data.partnerId").doesNotExist())
                .andExpect(jsonPath("$.data.partnerCode").value("P-CR-001"))
                .andExpect(jsonPath("$.data.bizNo").value("1234567890"))
                .andExpect(jsonPath("$.data.partnerName").value("삼한입금상사"))
                .andExpect(jsonPath("$.data.slipNo").isNotEmpty())
                .andExpect(jsonPath("$.data.externalRef").value(org.hamcrest.Matchers.startsWith("MANUAL:")))
                .andReturn();

        String id = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(get(BASE_URL + "/" + id)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.amount").value(120000))
                .andExpect(jsonPath("$.data.partnerId").doesNotExist())
                .andExpect(jsonPath("$.data.partnerCode").value("P-CR-001"))
                .andExpect(jsonPath("$.data.bizNo").value("1234567890"))
                .andExpect(jsonPath("$.data.partnerName").value("삼한입금상사"));

        mockMvc.perform(get(BASE_URL)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .param("status", "DRAFT")
                        .param("kind", "MANUAL_RECEIPT")
                        .param("partnerId", PARTNER_ID.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].status").value("DRAFT"))
                .andExpect(jsonPath("$.data.content[0].partnerId").doesNotExist())
                .andExpect(jsonPath("$.data.content[0].partnerCode").value("P-CR-001"))
                .andExpect(jsonPath("$.data.content[0].bizNo").value("1234567890"))
                .andExpect(jsonPath("$.data.content[0].partnerName").value("삼한입금상사"));

        mockMvc.perform(patch(BASE_URL + "/" + id)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody("121000"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.amount").value(121000))
                .andExpect(jsonPath("$.data.memo").value("수정 메모"))
                .andExpect(jsonPath("$.data.debitAccountCode").value("102"))
                .andExpect(jsonPath("$.data.creditAccountCode").value("110"));

        mockMvc.perform(post(BASE_URL + "/" + id + "/confirm")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.data.journalId").doesNotExist());

        mockMvc.perform(patch(BASE_URL + "/" + id)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody("122000"))))
                .andExpect(status().isConflict());

        Map<String, Object> invalidAccountBody = updateBody("122000");
        invalidAccountBody.put("debitAccountCode", "999999");
        mockMvc.perform(patch(BASE_URL + "/" + id)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalidAccountBody)))
                .andExpect(status().isConflict());

        mockMvc.perform(post(BASE_URL + "/" + id + "/cancel")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"))
                .andExpect(jsonPath("$.data.journalId").doesNotExist());
    }

    @Test
    @DisplayName("채번은 같은 거래일 수기 생성에서도 slip_no UNIQUE를 유지한다")
    void slipNoUniqueForSameTransactionDate() throws Exception {
        String first = createCashReceipt("10000");
        String second = createCashReceipt("20000");

        org.assertj.core.api.Assertions.assertThat(first).isNotEqualTo(second);
        org.assertj.core.api.Assertions.assertThat(first).startsWith("2026/07/03-");
        org.assertj.core.api.Assertions.assertThat(second).startsWith("2026/07/03-");
    }

    @Test
    @DisplayName("DRAFT 입금보고서만 soft-delete 가능하고 조회 목록에서 제외된다")
    void deleteDraftOnly() throws Exception {
        MvcResult created = mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createBody("30000"))))
                .andExpect(status().isCreated())
                .andReturn();
        String id = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(delete(BASE_URL + "/" + id)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
        entityManager.flush();
        entityManager.clear();

        mockMvc.perform(get(BASE_URL + "/" + id)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("V48 fresh DB에는 CashReceipt 상태/계정 컬럼과 CHECK 제약이 존재한다")
    void v48MigrationAddsColumnsAndChecks() {
        Integer columnCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM information_schema.columns
                 WHERE table_name = 'cash_receipts'
                   AND column_name IN ('status', 'debit_account_code', 'credit_account_code')
                """,
                Integer.class);
        org.assertj.core.api.Assertions.assertThat(columnCount).isEqualTo(3);

        Integer checkCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM pg_constraint c
                  JOIN pg_class t ON t.oid = c.conrelid
                 WHERE t.relname = 'cash_receipts'
                   AND c.contype = 'c'
                   AND (
                       pg_get_constraintdef(c.oid) LIKE '%CONFIRMED%'
                       OR pg_get_constraintdef(c.oid) LIKE '%MANUAL_RECEIPT%'
                   )
                """,
                Integer.class);
        org.assertj.core.api.Assertions.assertThat(checkCount).isGreaterThanOrEqualTo(2);
    }

    @Test
    @DisplayName("V49 fresh DB에는 CashReceipt version 낙관락 컬럼이 존재한다")
    void v49MigrationAddsVersionColumn() {
        Integer columnCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM information_schema.columns
                 WHERE table_name = 'cash_receipts'
                   AND column_name = 'version'
                   AND is_nullable = 'NO'
                   AND data_type = 'bigint'
                """,
                Integer.class);

        org.assertj.core.api.Assertions.assertThat(columnCount).isOne();
    }

    private String createCashReceipt(String amount) throws Exception {
        MvcResult result = mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createBody(amount))))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data").get("slipNo").asText();
    }

    private Map<String, Object> createBody(String amount) {
        Map<String, Object> body = new HashMap<>();
        body.put("partnerId", PARTNER_ID);
        body.put("amount", new BigDecimal(amount));
        body.put("transactionDate", "2026-07-03");
        body.put("memo", "수기 입금");
        return body;
    }

    private Map<String, Object> updateBody(String amount) {
        Map<String, Object> body = createBody(amount);
        body.put("memo", "수정 메모");
        body.put("debitAccountCode", "102");
        body.put("creditAccountCode", "110");
        return body;
    }
}
