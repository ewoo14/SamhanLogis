package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;
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
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.service.Mig9AgingSnapshotRefreshService;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import jakarta.persistence.EntityManager;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** CashReceipt 수기 CRUD + 상태 라이프사이클 IT. */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class CashReceiptControllerIT extends AbstractPostgresIT {

    private static final String BASE_URL = "/accounting/cash-receipts";
    private static final String ACCOUNTANT_ID = "00000000-0000-0000-0000-000000000104";
    private static final UUID PARTNER_ID = UUID.fromString("10000000-0000-0000-0000-000000000001");
    private static final UUID PARTNER_ID_2 = UUID.fromString("10000000-0000-0000-0000-000000000002");

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private EntityManager entityManager;

    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    @MockBean(classes = DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;
    @MockBean private Mig9AgingSnapshotRefreshService agingSnapshotRefreshService;

    @BeforeEach
    void setUpExternalClients() {
        lenient().when(partnerLookupClient.findByPartnerId(any())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerCode(any())).thenReturn(Optional.of(new PartnerSummary(
                PARTNER_ID, "P-CR-001", "삼한입금상사", "123-45-67890", "서울")));
        lenient().when(partnerLookupClient.searchDirectory(eq("입금"), any(Integer.class)))
                .thenReturn(List.of(
                        new PartnerSummary(PARTNER_ID, "P-CR-001", "삼한입금상사", "123-45-67890", "서울"),
                        new PartnerSummary(PARTNER_ID_2, "P-CR-002", "테스트입금상사", "234-56-78901", "부산")));
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
                .andExpect(jsonPath("$.data.debitAccountCode").value("102"))
                .andExpect(jsonPath("$.data.creditAccountCode").value("110"))
                .andExpect(jsonPath("$.data.journalId").doesNotExist())
                .andExpect(jsonPath("$.data.journalNo").doesNotExist())
                .andExpect(jsonPath("$.data.partnerId").doesNotExist())
                .andExpect(jsonPath("$.data.partnerCode").value("P-CR-001"))
                .andExpect(jsonPath("$.data.bizNo").value("1234567890"))
                .andExpect(jsonPath("$.data.partnerName").value("삼한입금상사"))
                .andExpect(jsonPath("$.data.slipNo").isNotEmpty())
                .andExpect(jsonPath("$.data.id").isNotEmpty())
                .andExpect(jsonPath("$.data.externalRef").value(org.hamcrest.Matchers.startsWith("MANUAL:")))
                .andReturn();

        com.fasterxml.jackson.databind.JsonNode createdData =
                objectMapper.readTree(created.getResponse().getContentAsString()).get("data");
        String receiptId = createdData.get("id").asText();

        mockMvc.perform(get(BASE_URL + "/{id}", receiptId)
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
                        .param("partnerName", "입금")
                        .param("slipNo", "2026/07/03"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].status").value("DRAFT"))
                .andExpect(jsonPath("$.data.content[0].partnerId").doesNotExist())
                .andExpect(jsonPath("$.data.content[0].id").isNotEmpty())
                .andExpect(jsonPath("$.data.content[0].partnerCode").value("P-CR-001"))
                .andExpect(jsonPath("$.data.content[0].bizNo").value("1234567890"))
                .andExpect(jsonPath("$.data.content[0].partnerName").value("삼한입금상사"));

        mockMvc.perform(patch(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody("121000"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.amount").value(121000))
                .andExpect(jsonPath("$.data.memo").value("수정 메모"))
                .andExpect(jsonPath("$.data.debitAccountCode").value("102"))
                .andExpect(jsonPath("$.data.creditAccountCode").value("110"));

        mockMvc.perform(post(BASE_URL + "/{id}/confirm", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.data.journalId").doesNotExist())
                .andExpect(jsonPath("$.data.journalNo").isNotEmpty());

        mockMvc.perform(patch(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody("122000"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.data.amount").value(122000))
                .andExpect(jsonPath("$.data.journalNo").isNotEmpty());

        Map<String, Object> invalidAccountBody = updateBody("122000");
        invalidAccountBody.put("debitAccountCode", "999999");
        mockMvc.perform(patch(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalidAccountBody)))
                .andExpect(status().isConflict());

        mockMvc.perform(post(BASE_URL + "/{id}/cancel", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"))
                .andExpect(jsonPath("$.data.journalId").doesNotExist())
                .andExpect(jsonPath("$.data.reverseJournalNo").isNotEmpty());
    }

    @Test
    @DisplayName("확정은 POSTED 분개를 생성하고 기본/override 계정을 라인에 반영한다")
    void confirmCreatesPostedJournalWithDefaultAndOverrideAccounts() throws Exception {
        MvcResult defaultReceipt = createReceipt(createBody("61000"));
        String defaultReceiptId = data(defaultReceipt).get("id").asText();
        String defaultSlipNo = data(defaultReceipt).get("slipNo").asText();

        MvcResult confirmed = mockMvc.perform(post(BASE_URL + "/{id}/confirm", defaultReceiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.data.journalNo").isNotEmpty())
                .andExpect(jsonPath("$.data.journalId").doesNotExist())
                .andReturn();
        String journalNo = data(confirmed).get("journalNo").asText();
        UUID journalId = receiptJournalId(defaultReceiptId);

        Map<String, Object> journal = journal(journalId);
        org.assertj.core.api.Assertions.assertThat(journal.get("journal_no")).isEqualTo(journalNo);
        org.assertj.core.api.Assertions.assertThat(journal.get("status")).isEqualTo("POSTED");
        org.assertj.core.api.Assertions.assertThat(journal.get("source_type")).isEqualTo("CASH_RECEIPT");
        org.assertj.core.api.Assertions.assertThat(journal.get("description").toString())
                .contains("입금보고서 확정", defaultSlipNo, "삼한입금상사");
        assertJournalLines(journalId, "102", "110", new BigDecimal("61000.00"));

        Map<String, Object> overrideBody = createBody("62000");
        overrideBody.put("debitAccountCode", "102");
        overrideBody.put("creditAccountCode", "110");
        MvcResult overrideReceipt = createReceipt(overrideBody);
        String overrideReceiptId = data(overrideReceipt).get("id").asText();

        mockMvc.perform(post(BASE_URL + "/{id}/confirm", overrideReceiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.journalNo").isNotEmpty());

        assertJournalLines(receiptJournalId(overrideReceiptId), "102", "110", new BigDecimal("62000.00"));
    }

    @Test
    @DisplayName("취소는 원분개를 REVERSED 처리하고 차대 swap 역분개 번호를 응답한다")
    void cancelCreatesReversalAndExposesReverseJournalNo() throws Exception {
        MvcResult created = createReceipt(createBody("63000"));
        String receiptId = data(created).get("id").asText();
        mockMvc.perform(post(BASE_URL + "/{id}/confirm", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
        UUID originalJournalId = receiptJournalId(receiptId);

        MvcResult cancelled = mockMvc.perform(post(BASE_URL + "/{id}/cancel", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"))
                .andExpect(jsonPath("$.data.reverseJournalNo").isNotEmpty())
                .andExpect(jsonPath("$.data.journalId").doesNotExist())
                .andReturn();

        UUID reverseJournalId = receiptReverseJournalId(receiptId);
        org.assertj.core.api.Assertions.assertThat(reverseJournalId).isNotNull();
        Map<String, Object> original = journal(originalJournalId);
        Map<String, Object> reversal = journal(reverseJournalId);
        org.assertj.core.api.Assertions.assertThat(original.get("status")).isEqualTo("REVERSED");
        org.assertj.core.api.Assertions.assertThat(original.get("reversed_journal_id")).isEqualTo(reverseJournalId);
        org.assertj.core.api.Assertions.assertThat(reversal.get("status")).isEqualTo("POSTED");
        org.assertj.core.api.Assertions.assertThat(reversal.get("journal_no"))
                .isEqualTo(data(cancelled).get("reverseJournalNo").asText());
        assertReversalLines(reverseJournalId, "102", "110", new BigDecimal("63000.00"));
    }

    @Test
    @DisplayName("CONFIRMED PATCH는 기존 분개 역분개 후 새 POSTED 분개로 교체한다")
    void confirmedPatchReversesExistingJournalAndReposts() throws Exception {
        MvcResult created = createReceipt(createBody("64000"));
        String receiptId = data(created).get("id").asText();
        mockMvc.perform(post(BASE_URL + "/{id}/confirm", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
        UUID oldJournalId = receiptJournalId(receiptId);

        MvcResult patched = mockMvc.perform(patch(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody("65000"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.data.amount").value(65000))
                .andExpect(jsonPath("$.data.debitAccountCode").value("102"))
                .andExpect(jsonPath("$.data.journalNo").isNotEmpty())
                .andReturn();

        UUID newJournalId = receiptJournalId(receiptId);
        org.assertj.core.api.Assertions.assertThat(newJournalId).isNotEqualTo(oldJournalId);
        org.assertj.core.api.Assertions.assertThat(journal(oldJournalId).get("status")).isEqualTo("REVERSED");
        org.assertj.core.api.Assertions.assertThat(journal(newJournalId).get("status")).isEqualTo("POSTED");
        org.assertj.core.api.Assertions.assertThat(journal(newJournalId).get("journal_no"))
                .isEqualTo(data(patched).get("journalNo").asText());
        assertJournalLines(newJournalId, "102", "110", new BigDecimal("65000.00"));

        mockMvc.perform(post(BASE_URL + "/{id}/cancel", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
        mockMvc.perform(patch(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody("66000"))))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("CONFIRMED journalId null MIG 행은 취소 상태전이만, 수정은 신규 분개 게시를 수행한다")
    void confirmedMigRowsWithoutJournalIdCanCancelOrPatch() throws Exception {
        UUID cancelOnlyId = insertConfirmedMigReceipt("MIG-S2-CANCEL", "MIG:S2:CANCEL", "67000");
        mockMvc.perform(post(BASE_URL + "/{id}/cancel", cancelOnlyId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"))
                .andExpect(jsonPath("$.data.journalNo").doesNotExist())
                .andExpect(jsonPath("$.data.reverseJournalNo").doesNotExist());
        org.assertj.core.api.Assertions.assertThat(receiptReverseJournalId(cancelOnlyId.toString())).isNull();

        UUID patchId = insertConfirmedMigReceipt("MIG-S2-PATCH", "MIG:S2:PATCH", "68000");
        mockMvc.perform(patch(BASE_URL + "/{id}", patchId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody("69000"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.data.amount").value(69000))
                .andExpect(jsonPath("$.data.journalNo").isNotEmpty());
        assertJournalLines(receiptJournalId(patchId.toString()), "102", "110", new BigDecimal("69000.00"));
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("확정 커밋 후 aging snapshot refresh를 afterCommit으로 호출한다")
    void confirmSchedulesAgingRefreshAfterCommit() throws Exception {
        clearInvocations(agingSnapshotRefreshService);
        MvcResult created = createReceipt(createBody("69100"));
        String receiptId = data(created).get("id").asText();

        mockMvc.perform(post(BASE_URL + "/{id}/confirm", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());

        verify(agingSnapshotRefreshService).refresh();
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
        String receiptId = objectMapper.readTree(created.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(delete(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
        entityManager.flush();
        entityManager.clear();

        mockMvc.perform(get(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("상태전이 가드 — DRAFT cancel, confirm 재호출, 재cancel, 확정/취소 삭제를 거부한다")
    void statusTransitionGuards() throws Exception {
        MvcResult draft = mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createBody("40000"))))
                .andExpect(status().isCreated())
                .andReturn();
        String receiptId = objectMapper.readTree(draft.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(post(BASE_URL + "/{id}/cancel", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict());

        mockMvc.perform(post(BASE_URL + "/{id}/confirm", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());

        mockMvc.perform(post(BASE_URL + "/{id}/confirm", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict());

        mockMvc.perform(delete(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict());

        mockMvc.perform(post(BASE_URL + "/{id}/cancel", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());

        mockMvc.perform(post(BASE_URL + "/{id}/cancel", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict());

        mockMvc.perform(post(BASE_URL + "/{id}/confirm", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict());

        mockMvc.perform(delete(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("거래처 resolve 오류 — partnerCode 미존재는 422")
    void createRejectsUnknownPartnerCode() throws Exception {
        lenient().when(partnerLookupClient.findByPartnerCode("NO-PARTNER")).thenReturn(Optional.empty());
        Map<String, Object> body = createBody("50000");
        body.put("partnerCode", "NO-PARTNER");

        mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("거래처 resolve 오류 — bizNo 다건 모호는 422")
    void createRejectsAmbiguousBizNo() throws Exception {
        lenient().when(partnerLookupClient.searchDirectory(eq("1234567890"), any(Integer.class)))
                .thenReturn(List.of(
                        new PartnerSummary(PARTNER_ID, "P-CR-001", "삼한입금상사", "123-45-67890", "서울"),
                        new PartnerSummary(PARTNER_ID_2, "P-CR-002", "테스트입금상사", "123-45-67890", "부산")));
        Map<String, Object> body = createBody("50000");
        body.remove("partnerCode");
        body.put("bizNo", "1234567890");

        mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("거래처 resolve 오류 — partnerName 미존재는 422")
    void createRejectsUnknownPartnerName() throws Exception {
        lenient().when(partnerLookupClient.findByPartnerName("없는거래처")).thenReturn(Optional.empty());
        Map<String, Object> body = createBody("50000");
        body.remove("partnerCode");
        body.put("partnerName", "없는거래처");

        mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("거래처 resolve 오류 — partnerCode/bizNo/partnerName 공란은 400")
    void createRejectsMissingPartnerSelectors() throws Exception {
        Map<String, Object> body = createBody("50000");
        body.remove("partnerCode");
        body.put("bizNo", " ");
        body.put("partnerName", " ");

        mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
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

    @Test
    @DisplayName("V50 fresh DB에는 CashReceipt reverse_journal_id 컬럼이 존재한다")
    void v50MigrationAddsReverseJournalColumn() {
        Integer columnCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM information_schema.columns
                 WHERE table_name = 'cash_receipts'
                   AND column_name = 'reverse_journal_id'
                   AND data_type = 'uuid'
                """,
                Integer.class);

        org.assertj.core.api.Assertions.assertThat(columnCount).isOne();
    }

    private String createCashReceipt(String amount) throws Exception {
        MvcResult result = createReceipt(createBody(amount));
        return objectMapper.readTree(result.getResponse().getContentAsString())
                .get("data").get("slipNo").asText();
    }

    private MvcResult createReceipt(Map<String, Object> body) throws Exception {
        return mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
    }

    private Map<String, Object> createBody(String amount) {
        Map<String, Object> body = new HashMap<>();
        body.put("partnerCode", "P-CR-001");
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

    private com.fasterxml.jackson.databind.JsonNode data(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("data");
    }

    private UUID receiptJournalId(String receiptId) {
        return jdbcTemplate.queryForObject(
                "SELECT journal_id FROM cash_receipts WHERE id = ?::uuid",
                UUID.class,
                receiptId);
    }

    private UUID receiptReverseJournalId(String receiptId) {
        return jdbcTemplate.queryForObject(
                "SELECT reverse_journal_id FROM cash_receipts WHERE id = ?::uuid",
                UUID.class,
                receiptId);
    }

    private Map<String, Object> journal(UUID journalId) {
        return jdbcTemplate.queryForMap(
                """
                SELECT id, journal_no, status, source_type, source_ref_id, reversed_journal_id, description
                  FROM journals
                 WHERE id = ?::uuid
                """,
                journalId.toString());
    }

    private List<Map<String, Object>> journalLines(UUID journalId) {
        return jdbcTemplate.queryForList(
                """
                SELECT line_no, account_code, debit_amount, credit_amount, partner_id
                  FROM journal_lines
                 WHERE journal_id = ?::uuid
                 ORDER BY line_no
                """,
                journalId.toString());
    }

    private void assertJournalLines(UUID journalId, String debitAccount, String creditAccount, BigDecimal amount) {
        List<Map<String, Object>> lines = journalLines(journalId);
        org.assertj.core.api.Assertions.assertThat(lines).hasSize(2);
        org.assertj.core.api.Assertions.assertThat(lines.get(0).get("account_code")).isEqualTo(debitAccount);
        org.assertj.core.api.Assertions.assertThat((BigDecimal) lines.get(0).get("debit_amount"))
                .isEqualByComparingTo(amount);
        org.assertj.core.api.Assertions.assertThat((BigDecimal) lines.get(0).get("credit_amount"))
                .isEqualByComparingTo(BigDecimal.ZERO);
        org.assertj.core.api.Assertions.assertThat(lines.get(1).get("account_code")).isEqualTo(creditAccount);
        org.assertj.core.api.Assertions.assertThat((BigDecimal) lines.get(1).get("debit_amount"))
                .isEqualByComparingTo(BigDecimal.ZERO);
        org.assertj.core.api.Assertions.assertThat((BigDecimal) lines.get(1).get("credit_amount"))
                .isEqualByComparingTo(amount);
    }

    private void assertReversalLines(UUID journalId, String debitAccount, String creditAccount, BigDecimal amount) {
        List<Map<String, Object>> lines = journalLines(journalId);
        org.assertj.core.api.Assertions.assertThat(lines).hasSize(2);
        org.assertj.core.api.Assertions.assertThat(lines.get(0).get("account_code")).isEqualTo(debitAccount);
        org.assertj.core.api.Assertions.assertThat((BigDecimal) lines.get(0).get("debit_amount"))
                .isEqualByComparingTo(BigDecimal.ZERO);
        org.assertj.core.api.Assertions.assertThat((BigDecimal) lines.get(0).get("credit_amount"))
                .isEqualByComparingTo(amount);
        org.assertj.core.api.Assertions.assertThat(lines.get(1).get("account_code")).isEqualTo(creditAccount);
        org.assertj.core.api.Assertions.assertThat((BigDecimal) lines.get(1).get("debit_amount"))
                .isEqualByComparingTo(amount);
        org.assertj.core.api.Assertions.assertThat((BigDecimal) lines.get(1).get("credit_amount"))
                .isEqualByComparingTo(BigDecimal.ZERO);
    }

    private UUID insertConfirmedMigReceipt(String slipNo, String externalRef, String amount) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                """
                INSERT INTO cash_receipts (
                    id, slip_no, partner_id, amount, transaction_date, kind, status,
                    debit_account_code, credit_account_code, memo, journal_id, external_ref,
                    version, created_at, created_by, is_deleted
                )
                VALUES (
                    ?::uuid, ?, ?::uuid, ?, '2026-07-03', 'DEPOSIT_REPORT', 'CONFIRMED',
                    ?, ?, 'MIG 미게시 입금보고서', NULL, ?, 0, NOW(), 'mig-test', FALSE
                )
                """,
                id.toString(),
                slipNo,
                PARTNER_ID.toString(),
                new BigDecimal(amount),
                CashReceipt.DEFAULT_DEBIT_ACCOUNT_CODE,
                CashReceipt.DEFAULT_CREDIT_ACCOUNT_CODE,
                externalRef);
        return id;
    }
}
