package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
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
import com.samhanair.logis.accounting.domain.CashReceipt;
import com.samhanair.logis.accounting.web.dto.OpaqueUuidSerializer;
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
    private static final String OVERRIDE_DEBIT_ACCOUNT_CODE = "101";
    private static final String OVERRIDE_CREDIT_ACCOUNT_CODE = "120";
    private static final UUID PARTNER_ID = UUID.fromString("10000000-0000-0000-0000-000000000001");
    private static final UUID PARTNER_ID_2 = UUID.fromString("10000000-0000-0000-0000-000000000002");

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private EntityManager entityManager;
    @Autowired private Mig9AgingSnapshotRefreshService agingSnapshotRefreshService;

    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ApprovalLineAuthorizeClient approvalLineAuthorizeClient;
    @MockBean(classes = DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;
    // Mig9AgingSnapshotRefreshService 는 내부 로직이므로 mock 금지 — mock 은 afterCommit×NOT_SUPPORTED
    // 트랜잭션 시맨틱스(과거 NEVER 충돌로 라이브 100% 실패)를 우회해 false-green 을 만든다.

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
                objectMapper.readTree(created.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).get("data");
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
                .andExpect(jsonPath("$.data.debitAccountCode").value(OVERRIDE_DEBIT_ACCOUNT_CODE))
                .andExpect(jsonPath("$.data.creditAccountCode").value(OVERRIDE_CREDIT_ACCOUNT_CODE));

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

        // 미존재 계정 = 404 (requireLeafAccount NOT_FOUND — S1 create 경로와 동일 계약).
        UUID journalBeforeInvalid = receiptJournalId(receiptId);
        Map<String, Object> invalidAccountBody = updateBody("123000");
        invalidAccountBody.put("debitAccountCode", "999999");
        mockMvc.perform(patch(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(invalidAccountBody)))
                .andExpect(status().isNotFound());

        // 비-leaf 계정('100' 자산 그룹) = 400.
        Map<String, Object> nonLeafAccountBody = updateBody("123000");
        nonLeafAccountBody.put("debitAccountCode", "100");
        mockMvc.perform(patch(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(nonLeafAccountBody)))
                .andExpect(status().isBadRequest());

        // 실패한 수정은 원장 무손상 — 계정검증이 mutation/역분개보다 선행함을 회귀로 고정.
        org.assertj.core.api.Assertions.assertThat(receiptJournalId(receiptId)).isEqualTo(journalBeforeInvalid);
        org.assertj.core.api.Assertions.assertThat(journal(journalBeforeInvalid).get("status")).isEqualTo("POSTED");

        mockMvc.perform(post(BASE_URL + "/{id}/cancel", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"))
                .andExpect(jsonPath("$.data.journalId").doesNotExist())
                .andExpect(jsonPath("$.data.reverseJournalNo").isNotEmpty());
    }

    @Test
    @DisplayName("입금보고서 slipNo 검색의 wildcard는 리터럴로만 매칭한다")
    void list_slipNoWildcard_isLiteral() throws Exception {
        insertConfirmedMigReceipt("CASH-LUNA%", "cash-red-1", "10000");
        insertConfirmedMigReceipt("CASH-LUNAX", "cash-red-2", "20000");

        mockMvc.perform(get(BASE_URL)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .param("slipNo", "CASH-LUNA%"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].slipNo").value("CASH-LUNA%"));
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
        // X-User-Id actor 가 분개 posted_by 로 전파된다.
        org.assertj.core.api.Assertions.assertThat(journal.get("posted_by")).isEqualTo(ACCOUNTANT_ID);
        org.assertj.core.api.Assertions.assertThat(journal.get("description").toString())
                .contains("입금보고서 확정", defaultSlipNo, "삼한입금상사");
        assertJournalLines(journalId, "102", "110", new BigDecimal("61000.00"));

        // #744 라운드1 LOW — CASH_RECEIPT 라이브 분개는 실 HTTP GET(분개 단건 조회) 응답에도
        // 원천 입금보고서 전표번호(cashReceiptSlipNo)를 노출한다. 단위 mock 이 아닌 실 Postgres
        // + 실 컨트롤러/서비스 경로(JournalService.getOne → CashReceiptRepository 실조회)로 검증.
        mockMvc.perform(get("/accounting/journals/{id}", journalId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sourceRefId").value(opaque(defaultReceiptId)))
                // #772 fix — 원분개도 전용 cashReceiptId 를 노출한다 (아래 cancelCreatesReversalAnd
                // ExposesReverseJournalNo 의 역분개 cashReceiptId 검증과의 대칭성).
                .andExpect(jsonPath("$.data.cashReceiptId").value(opaque(defaultReceiptId)))
                .andExpect(jsonPath("$.data.cashReceiptSlipNo").value(defaultSlipNo));

        Map<String, Object> overrideBody = createBody("62000");
        overrideBody.put("debitAccountCode", OVERRIDE_DEBIT_ACCOUNT_CODE);
        overrideBody.put("creditAccountCode", OVERRIDE_CREDIT_ACCOUNT_CODE);
        MvcResult overrideReceipt = createReceipt(overrideBody);
        String overrideReceiptId = data(overrideReceipt).get("id").asText();

        mockMvc.perform(post(BASE_URL + "/{id}/confirm", overrideReceiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.journalNo").isNotEmpty());

        assertJournalLines(receiptJournalId(overrideReceiptId),
                OVERRIDE_DEBIT_ACCOUNT_CODE, OVERRIDE_CREDIT_ACCOUNT_CODE, new BigDecimal("62000.00"));
    }

    @Test
    @DisplayName("취소는 원분개를 REVERSED 처리하고 차대 swap 역분개 번호를 응답한다")
    void cancelCreatesReversalAndExposesReverseJournalNo() throws Exception {
        MvcResult created = createReceipt(createBody("63000"));
        String receiptId = data(created).get("id").asText();
        String slipNo = data(created).get("slipNo").asText();
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

        // #771 회귀 — 역분개는 원분개 UUID(sourceRefId, 이중 의미)가 아닌 전용 cashReceiptId 로
        // 원천 입금보고서를 가리켜야 한다. 실 HTTP GET(단건 조회)으로 응답 DTO 까지 검증한다
        // (역분개 상세에서 "입금보고서 보기" 버튼이 사라지던 회귀 — 원분개 id 로 오인되지 않음도 함께 고정).
        mockMvc.perform(get("/accounting/journals/{id}", reverseJournalId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cashReceiptId").value(opaque(receiptId)))
                .andExpect(jsonPath("$.data.cashReceiptSlipNo").value(slipNo))
                .andExpect(jsonPath("$.data.sourceRefId").value(opaque(originalJournalId.toString())))
                .andExpect(jsonPath("$.data.cashReceiptId")
                        .value(org.hamcrest.Matchers.not(opaque(originalJournalId.toString()))));
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
                .andExpect(jsonPath("$.data.debitAccountCode").value(OVERRIDE_DEBIT_ACCOUNT_CODE))
                .andExpect(jsonPath("$.data.creditAccountCode").value(OVERRIDE_CREDIT_ACCOUNT_CODE))
                .andExpect(jsonPath("$.data.journalNo").isNotEmpty())
                .andReturn();

        UUID newJournalId = receiptJournalId(receiptId);
        org.assertj.core.api.Assertions.assertThat(newJournalId).isNotEqualTo(oldJournalId);
        org.assertj.core.api.Assertions.assertThat(journal(oldJournalId).get("status")).isEqualTo("REVERSED");
        org.assertj.core.api.Assertions.assertThat(journal(newJournalId).get("status")).isEqualTo("POSTED");
        org.assertj.core.api.Assertions.assertThat(journal(newJournalId).get("journal_no"))
                .isEqualTo(data(patched).get("journalNo").asText());
        // 재게시 적요는 최초 확정과 구분된다 (감사 추적성).
        org.assertj.core.api.Assertions.assertThat(journal(newJournalId).get("description").toString())
                .contains("입금보고서 수정 재게시");
        assertJournalLines(newJournalId,
                OVERRIDE_DEBIT_ACCOUNT_CODE, OVERRIDE_CREDIT_ACCOUNT_CODE, new BigDecimal("65000.00"));

        // 무변경 PATCH = 역분개+재게시 생략 (원장 노이즈 차단) — journalId 가 그대로다.
        mockMvc.perform(patch(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody("65000"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CONFIRMED"));
        org.assertj.core.api.Assertions.assertThat(receiptJournalId(receiptId)).isEqualTo(newJournalId);
        org.assertj.core.api.Assertions.assertThat(journal(newJournalId).get("status")).isEqualTo("POSTED");

        // 연쇄 수정 — 2번째 PATCH 는 1번째 재게시 분개(원분개 아님)를 역분개한다.
        mockMvc.perform(patch(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody("65500"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.amount").value(65500));
        UUID thirdJournalId = receiptJournalId(receiptId);
        org.assertj.core.api.Assertions.assertThat(thirdJournalId).isNotEqualTo(newJournalId);
        org.assertj.core.api.Assertions.assertThat(journal(newJournalId).get("status")).isEqualTo("REVERSED");
        org.assertj.core.api.Assertions.assertThat(journal(newJournalId).get("reversed_journal_id")).isNotNull();
        org.assertj.core.api.Assertions.assertThat(journal(thirdJournalId).get("status")).isEqualTo("POSTED");
        assertJournalLines(thirdJournalId,
                OVERRIDE_DEBIT_ACCOUNT_CODE, OVERRIDE_CREDIT_ACCOUNT_CODE, new BigDecimal("65500.00"));

        // 수정 후 취소 — 마지막 재게시 분개가 역분개된다.
        mockMvc.perform(post(BASE_URL + "/{id}/cancel", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.reverseJournalNo").isNotEmpty());
        org.assertj.core.api.Assertions.assertThat(journal(thirdJournalId).get("status")).isEqualTo("REVERSED");
        org.assertj.core.api.Assertions.assertThat(receiptReverseJournalId(receiptId)).isNotNull();

        mockMvc.perform(patch(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody("66000"))))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("CONFIRMED에서 헤더 불변 분할 행만 PATCH해도 저장·역분개·재게시한다")
    void confirmedPatchLinesOnlyReversesAndReposts() throws Exception {
        MvcResult created = createReceipt(createBody("1000"));
        String receiptId = data(created).get("id").asText();
        mockMvc.perform(post(BASE_URL + "/{id}/confirm", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
        UUID oldJournalId = receiptJournalId(receiptId);

        Map<String, Object> linesOnly = createBody("1000");
        linesOnly.put("debitAccountCode", CashReceipt.DEFAULT_DEBIT_ACCOUNT_CODE);
        linesOnly.put("creditAccountCode", CashReceipt.DEFAULT_CREDIT_ACCOUNT_CODE);
        linesOnly.put("lines", List.of(
                Map.of("partnerCode", "P-CR-001", "amount", 600, "memo", "분할A"),
                Map.of("partnerCode", "P-CR-001", "amount", 400, "memo", "분할B")));

        MvcResult patched = mockMvc.perform(patch(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(linesOnly)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.amount").value(1000))
                .andExpect(jsonPath("$.data.lines.length()").value(2))
                .andReturn();

        UUID newJournalId = receiptJournalId(receiptId);
        org.assertj.core.api.Assertions.assertThat(newJournalId).isNotEqualTo(oldJournalId);
        org.assertj.core.api.Assertions.assertThat(journal(oldJournalId).get("status")).isEqualTo("REVERSED");
        org.assertj.core.api.Assertions.assertThat(journal(newJournalId).get("status")).isEqualTo("POSTED");
        org.assertj.core.api.Assertions.assertThat(journalLines(newJournalId)).hasSize(4);
        System.out.println("CONFIRMED_LINES_ONLY_DB old_status=" + journal(oldJournalId).get("status")
                + " new_status=" + journal(newJournalId).get("status")
                + " new_journal_lines=" + journalLines(newJournalId).size()
                + " response_lines=" + data(patched).get("lines").size());
        org.assertj.core.api.Assertions.assertThat(data(patched).get("lines").get(0).get("amount").decimalValue())
                .isEqualByComparingTo("600");
        org.assertj.core.api.Assertions.assertThat(data(patched).get("lines").get(1).get("amount").decimalValue())
                .isEqualByComparingTo("400");
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
        assertJournalLines(receiptJournalId(patchId.toString()),
                OVERRIDE_DEBIT_ACCOUNT_CODE, OVERRIDE_CREDIT_ACCOUNT_CODE, new BigDecimal("69000.00"));
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("확정 커밋 후 afterCommit이 실 빈으로 partner_aging_snapshot을 실제 갱신한다")
    void confirmRefreshesAgingSnapshotAfterCommit() throws Exception {
        // 실 커밋(NOT_SUPPORTED) + 실 빈 — @MockBean 이면 NEVER/NOT_SUPPORTED 트랜잭션 프록시가
        // 우회되어 afterCommit 실행 가능성이 검증되지 않는다(과거 NEVER 충돌 false-green).
        agingSnapshotRefreshService.refresh();
        java.time.OffsetDateTime refreshedBefore = jdbcTemplate.queryForObject(
                "SELECT MAX(last_refreshed_at) FROM partner_aging_snapshot", java.time.OffsetDateTime.class);
        String receiptId = null;
        try {
            MvcResult created = createReceipt(createBody("69100"));
            receiptId = data(created).get("id").asText();

            mockMvc.perform(post(BASE_URL + "/{id}/confirm", receiptId)
                            .header("X-User-Id", ACCOUNTANT_ID)
                            .header("X-User-Role", "ACCOUNTANT"))
                    .andExpect(status().isOk());

            // refresh 성공 = MV timestamp 전진 + 확정 분개(차 102/대 110)가 net 에 실반영.
            java.time.OffsetDateTime refreshedAfter = jdbcTemplate.queryForObject(
                    "SELECT MAX(last_refreshed_at) FROM partner_aging_snapshot", java.time.OffsetDateTime.class);
            org.assertj.core.api.Assertions.assertThat(refreshedAfter).isNotNull();
            if (refreshedBefore != null) {
                org.assertj.core.api.Assertions.assertThat(refreshedAfter).isAfter(refreshedBefore);
            }
            Map<String, Object> agingRow = jdbcTemplate.queryForMap(
                    "SELECT net_cash, net_receivable FROM partner_aging_snapshot WHERE partner_id = ?",
                    PARTNER_ID);
            org.assertj.core.api.Assertions.assertThat((BigDecimal) agingRow.get("net_cash"))
                    .isEqualByComparingTo(new BigDecimal("69100"));
            org.assertj.core.api.Assertions.assertThat((BigDecimal) agingRow.get("net_receivable"))
                    .isEqualByComparingTo(new BigDecimal("-69100"));
        } finally {
            cleanupCommittedReceiptAndRefreshAging(receiptId);
        }
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("취소 afterCommit refresh는 V52 POSTED+REVERSED MV에서 입금보고서 net을 baseline으로 되돌린다")
    void cancelRefreshesAgingSnapshotBackToBaseline() throws Exception {
        agingSnapshotRefreshService.refresh();
        Map<String, BigDecimal> baseline = agingNetForPartner(PARTNER_ID);
        String receiptId = null;
        try {
            MvcResult created = createReceipt(createBody("69200"));
            receiptId = data(created).get("id").asText();
            mockMvc.perform(post(BASE_URL + "/{id}/confirm", receiptId)
                            .header("X-User-Id", ACCOUNTANT_ID)
                            .header("X-User-Role", "ACCOUNTANT"))
                    .andExpect(status().isOk());
            Map<String, BigDecimal> afterConfirm = agingNetForPartner(PARTNER_ID);
            org.assertj.core.api.Assertions.assertThat(afterConfirm.get("net_cash"))
                    .isEqualByComparingTo(baseline.get("net_cash").add(new BigDecimal("69200")));

            mockMvc.perform(post(BASE_URL + "/{id}/cancel", receiptId)
                            .header("X-User-Id", ACCOUNTANT_ID)
                            .header("X-User-Role", "ACCOUNTANT"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.reverseJournalNo").isNotEmpty());

            Map<String, BigDecimal> afterCancel = agingNetForPartner(PARTNER_ID);
            org.assertj.core.api.Assertions.assertThat(afterCancel.get("net_cash"))
                    .isEqualByComparingTo(baseline.get("net_cash"));
            org.assertj.core.api.Assertions.assertThat(afterCancel.get("net_receivable"))
                    .isEqualByComparingTo(baseline.get("net_receivable"));
        } finally {
            cleanupCommittedReceiptAndRefreshAging(receiptId);
        }
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    @DisplayName("CONFIRMED PATCH afterCommit refresh는 역분개+재게시 후 최종 금액만 aging net에 남긴다")
    void confirmedPatchRefreshesAgingSnapshotToFinalDelta() throws Exception {
        agingSnapshotRefreshService.refresh();
        Map<String, BigDecimal> baseline = agingNetForPartner(PARTNER_ID);
        String receiptId = null;
        try {
            MvcResult created = createReceipt(createBody("69300"));
            receiptId = data(created).get("id").asText();
            mockMvc.perform(post(BASE_URL + "/{id}/confirm", receiptId)
                            .header("X-User-Id", ACCOUNTANT_ID)
                            .header("X-User-Role", "ACCOUNTANT"))
                    .andExpect(status().isOk());

            mockMvc.perform(patch(BASE_URL + "/{id}", receiptId)
                            .header("X-User-Id", ACCOUNTANT_ID)
                            .header("X-User-Role", "ACCOUNTANT")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(defaultAccountUpdateBody("69400"))))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.amount").value(69400));

            Map<String, BigDecimal> afterPatch = agingNetForPartner(PARTNER_ID);
            org.assertj.core.api.Assertions.assertThat(afterPatch.get("net_cash"))
                    .isEqualByComparingTo(baseline.get("net_cash").add(new BigDecimal("69400")));
            org.assertj.core.api.Assertions.assertThat(afterPatch.get("net_receivable"))
                    .isEqualByComparingTo(baseline.get("net_receivable").subtract(new BigDecimal("69400")));
        } finally {
            cleanupCommittedReceiptAndRefreshAging(receiptId);
        }
    }

    @Test
    @DisplayName("마감된 회계 기간 일자의 확정/수정은 409로 차단된다")
    void confirmAndPatchBlockedForClosedPeriod() throws Exception {
        jdbcTemplate.update("""
                INSERT INTO accounting_periods (
                    id, period_type, period_date, status, total_sales, total_purchase, total_expense,
                    locked_slip_count, version, created_at, created_by, is_deleted
                ) VALUES (gen_random_uuid(), 'MONTHLY', '2026-06-01', 'CLOSED', 0, 0, 0, 0, 0, NOW(), 'IT', FALSE)
                """);

        Map<String, Object> closedBody = createBody("71000");
        closedBody.put("transactionDate", "2026-06-15");
        MvcResult created = createReceipt(closedBody);
        String receiptId = data(created).get("id").asText();

        mockMvc.perform(post(BASE_URL + "/{id}/confirm", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict());
        // 409 조기 종료 경로는 flush 유발 쿼리가 없어 pending INSERT 를 raw JDBC 가 못 본다 — 명시 flush.
        entityManager.flush();
        org.assertj.core.api.Assertions.assertThat(receiptJournalId(receiptId)).isNull();

        // 열린 기간(오늘) 확정 후 마감 월 일자로 PATCH — 재게시도 동일 가드.
        MvcResult openCreated = createReceipt(createBody("72000"));
        String openReceiptId = data(openCreated).get("id").asText();
        mockMvc.perform(post(BASE_URL + "/{id}/confirm", openReceiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
        UUID journalBefore = receiptJournalId(openReceiptId);

        Map<String, Object> patchToClosed = updateBody("72500");
        patchToClosed.put("transactionDate", "2026-06-15");
        mockMvc.perform(patch(BASE_URL + "/{id}", openReceiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(patchToClosed)))
                .andExpect(status().isConflict());
        org.assertj.core.api.Assertions.assertThat(receiptJournalId(openReceiptId)).isEqualTo(journalBefore);
        org.assertj.core.api.Assertions.assertThat(journal(journalBefore).get("status")).isEqualTo("POSTED");
    }

    @Test
    @DisplayName("마감된 원분개 일자의 입금보고서 취소는 409로 차단하고 마감 해제 후 정상 취소된다")
    void cancelBlockedWhenOriginalJournalDateIsClosedAndSucceedsAfterReopen() throws Exception {
        MvcResult created = createReceipt(createBody("73100"));
        String receiptId = data(created).get("id").asText();
        mockMvc.perform(post(BASE_URL + "/{id}/confirm", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
        UUID originalJournalId = receiptJournalId(receiptId);
        insertClosedMonthlyPeriod("2026-07-01");

        MvcResult closedCancel = mockMvc.perform(post(BASE_URL + "/{id}/cancel", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict())
                .andReturn();
        org.assertj.core.api.Assertions.assertThat(dataMessage(closedCancel))
                .contains("마감된 회계 기간");

        org.assertj.core.api.Assertions.assertThat(receiptStatus(receiptId)).isEqualTo("CONFIRMED");
        org.assertj.core.api.Assertions.assertThat(receiptJournalId(receiptId)).isEqualTo(originalJournalId);
        org.assertj.core.api.Assertions.assertThat(receiptReverseJournalId(receiptId)).isNull();
        org.assertj.core.api.Assertions.assertThat(journal(originalJournalId).get("status")).isEqualTo("POSTED");
        org.assertj.core.api.Assertions.assertThat(reversalCountForOriginal(originalJournalId)).isZero();

        reopenMonthlyPeriod("2026-07-01");

        mockMvc.perform(post(BASE_URL + "/{id}/cancel", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"))
                .andExpect(jsonPath("$.data.reverseJournalNo").isNotEmpty());
        org.assertj.core.api.Assertions.assertThat(journal(originalJournalId).get("status")).isEqualTo("REVERSED");
        org.assertj.core.api.Assertions.assertThat(receiptReverseJournalId(receiptId)).isNotNull();
    }

    @Test
    @DisplayName("마감된 원분개 + 열린 일자 CONFIRMED PATCH는 409로 차단하고 기존 분개를 보존한다")
    void confirmedPatchBlockedWhenOriginalJournalDateIsClosedEvenIfTargetDateOpen() throws Exception {
        MvcResult created = createReceipt(createBody("73200"));
        String receiptId = data(created).get("id").asText();
        mockMvc.perform(post(BASE_URL + "/{id}/confirm", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
        UUID originalJournalId = receiptJournalId(receiptId);
        insertClosedMonthlyPeriod("2026-07-01");

        Map<String, Object> patchToOpenDate = updateBody("73300");
        patchToOpenDate.put("transactionDate", "2026-08-03");
        mockMvc.perform(patch(BASE_URL + "/{id}", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(patchToOpenDate)))
                .andExpect(status().isConflict());

        org.assertj.core.api.Assertions.assertThat(receiptStatus(receiptId)).isEqualTo("CONFIRMED");
        org.assertj.core.api.Assertions.assertThat(receiptAmount(receiptId)).isEqualByComparingTo("73200.00");
        org.assertj.core.api.Assertions.assertThat(receiptTransactionDate(receiptId)).isEqualTo("2026-07-03");
        org.assertj.core.api.Assertions.assertThat(receiptJournalId(receiptId)).isEqualTo(originalJournalId);
        org.assertj.core.api.Assertions.assertThat(receiptReverseJournalId(receiptId)).isNull();
        org.assertj.core.api.Assertions.assertThat(journal(originalJournalId).get("status")).isEqualTo("POSTED");
        org.assertj.core.api.Assertions.assertThat(reversalCountForOriginal(originalJournalId)).isZero();
    }

    @Test
    @DisplayName("입금보고서 자동 분개는 원장 직접 역분개가 409로 차단된다 (원천 문서 경유 강제)")
    void cashReceiptJournalCannotBeReversedDirectly() throws Exception {
        MvcResult created = createReceipt(createBody("73000"));
        String receiptId = data(created).get("id").asText();
        mockMvc.perform(post(BASE_URL + "/{id}/confirm", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
        UUID journalId = receiptJournalId(receiptId);

        mockMvc.perform(post("/accounting/journals/{id}/reverse", journalId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict());
        org.assertj.core.api.Assertions.assertThat(journal(journalId).get("status")).isEqualTo("POSTED");

        // 원천 문서 경유 취소는 정상 동작 유지.
        mockMvc.perform(post(BASE_URL + "/{id}/cancel", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.reverseJournalNo").isNotEmpty());
    }

    @Test
    @DisplayName("memo 495자 이상 생성은 400 — 역분개 prefix 여유(494자)를 입력 단계에서 강제한다")
    void memoLongerThan494IsRejected() throws Exception {
        Map<String, Object> body = createBody("74000");
        body.put("memo", "가".repeat(495));
        mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());

        Map<String, Object> boundary = createBody("74100");
        boundary.put("memo", "가".repeat(494));
        mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(boundary)))
                .andExpect(status().isCreated());
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
        String receiptId = objectMapper.readTree(created.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
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
        String receiptId = objectMapper.readTree(draft.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .get("data").get("id").asText();

        MvcResult draftCancel = mockMvc.perform(post(BASE_URL + "/{id}/cancel", receiptId)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict())
                .andReturn();
        org.assertj.core.api.Assertions.assertThat(dataMessage(draftCancel))
                .contains("확정")
                .contains("임시저장")
                .doesNotContain("CONFIRMED")
                .doesNotContain("DRAFT");

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

    @Test
    @DisplayName("V51 fresh DB의 기본 차변 계정 DEFAULT는 102(보통예금)다")
    void v51MigrationSetsDebitAccountDefault102() {
        String columnDefault = jdbcTemplate.queryForObject(
                """
                SELECT column_default
                  FROM information_schema.columns
                 WHERE table_name = 'cash_receipts'
                   AND column_name = 'debit_account_code'
                """,
                String.class);

        org.assertj.core.api.Assertions.assertThat(columnDefault).contains("'102'");
    }

    /** partner_aging_snapshot 이 jl.partner_id 기준 집계이므로 라인 partner 전파를 회귀로 고정한다. */
    private static void assertLinesCarryPartner(List<Map<String, Object>> lines) {
        for (Map<String, Object> line : lines) {
            org.assertj.core.api.Assertions.assertThat(line.get("partner_id")).isEqualTo(PARTNER_ID);
        }
    }

    private String createCashReceipt(String amount) throws Exception {
        MvcResult result = createReceipt(createBody(amount));
        return objectMapper.readTree(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .get("data").get("slipNo").asText();
    }

    private static String opaque(String uuid) {
        return OpaqueUuidSerializer.encode(UUID.fromString(uuid));
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
        return updateBodyWithAccounts(amount, OVERRIDE_DEBIT_ACCOUNT_CODE, OVERRIDE_CREDIT_ACCOUNT_CODE);
    }

    private Map<String, Object> defaultAccountUpdateBody(String amount) {
        return updateBodyWithAccounts(
                amount, CashReceipt.DEFAULT_DEBIT_ACCOUNT_CODE, CashReceipt.DEFAULT_CREDIT_ACCOUNT_CODE);
    }

    private Map<String, Object> updateBodyWithAccounts(String amount, String debitAccountCode, String creditAccountCode) {
        Map<String, Object> body = createBody(amount);
        body.put("memo", "수정 메모");
        body.put("debitAccountCode", debitAccountCode);
        body.put("creditAccountCode", creditAccountCode);
        return body;
    }

    private com.fasterxml.jackson.databind.JsonNode data(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).get("data");
    }

    private String dataMessage(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .get("message").asText();
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

    private String receiptStatus(String receiptId) {
        return jdbcTemplate.queryForObject(
                "SELECT status FROM cash_receipts WHERE id = ?::uuid",
                String.class,
                receiptId);
    }

    private BigDecimal receiptAmount(String receiptId) {
        return jdbcTemplate.queryForObject(
                "SELECT amount FROM cash_receipts WHERE id = ?::uuid",
                BigDecimal.class,
                receiptId);
    }

    private String receiptTransactionDate(String receiptId) {
        return jdbcTemplate.queryForObject(
                "SELECT transaction_date::text FROM cash_receipts WHERE id = ?::uuid",
                String.class,
                receiptId);
    }

    private int reversalCountForOriginal(UUID originalJournalId) {
        return jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM journals
                 WHERE source_type = 'CASH_RECEIPT'
                   AND source_ref_id = ?::uuid
                """,
                Integer.class,
                originalJournalId.toString());
    }

    private void insertClosedMonthlyPeriod(String monthFirst) {
        jdbcTemplate.update("""
                INSERT INTO accounting_periods (
                    id, period_type, period_date, status, total_sales, total_purchase, total_expense,
                    locked_slip_count, version, created_at, created_by, is_deleted
                ) VALUES (gen_random_uuid(), 'MONTHLY', ?::date, 'CLOSED', 0, 0, 0, 0, 0, NOW(), 'IT', FALSE)
                """, monthFirst);
    }

    private void reopenMonthlyPeriod(String monthFirst) {
        jdbcTemplate.update("""
                UPDATE accounting_periods
                   SET status = 'OPEN',
                       reversed_at = NOW(),
                       reversed_by = 'IT'
                 WHERE period_type = 'MONTHLY'
                   AND period_date = ?::date
                """, monthFirst);
    }

    private Map<String, Object> journal(UUID journalId) {
        return jdbcTemplate.queryForMap(
                """
                SELECT id, journal_no, status, source_type, source_ref_id, reversed_journal_id, description,
                       posted_by
                  FROM journals
                 WHERE id = ?::uuid
                """,
                journalId.toString());
    }

    private Map<String, BigDecimal> agingNetForPartner(UUID partnerId) {
        return jdbcTemplate.queryForMap(
                """
                SELECT COALESCE(SUM(net_cash), 0) AS net_cash,
                       COALESCE(SUM(net_receivable), 0) AS net_receivable
                  FROM partner_aging_snapshot
                 WHERE partner_id = ?::uuid
                """,
                partnerId.toString()).entrySet().stream()
                .collect(java.util.stream.Collectors.toMap(
                        Map.Entry::getKey,
                        entry -> (BigDecimal) entry.getValue()));
    }

    private void cleanupCommittedReceiptAndRefreshAging(String receiptId) {
        if (receiptId == null) {
            return;
        }
        List<UUID> journalIds = jdbcTemplate.queryForList(
                """
                WITH direct_journals AS (
                    SELECT id
                      FROM journals
                     WHERE source_type = 'CASH_RECEIPT'
                       AND source_ref_id = ?::uuid
                    UNION
                    SELECT journal_id
                      FROM cash_receipts
                     WHERE id = ?::uuid
                       AND journal_id IS NOT NULL
                    UNION
                    SELECT reverse_journal_id
                      FROM cash_receipts
                     WHERE id = ?::uuid
                       AND reverse_journal_id IS NOT NULL
                ),
                all_journals AS (
                    SELECT id FROM direct_journals
                    UNION
                    SELECT j.id
                      FROM journals j
                     WHERE j.source_type = 'CASH_RECEIPT'
                       AND j.source_ref_id IN (SELECT id FROM direct_journals)
                )
                SELECT id FROM all_journals
                """,
                UUID.class,
                receiptId,
                receiptId,
                receiptId);
        for (UUID journalId : journalIds) {
            jdbcTemplate.update("DELETE FROM journal_lines WHERE journal_id = ?", journalId);
        }
        for (UUID journalId : journalIds) {
            jdbcTemplate.update("DELETE FROM journals WHERE id = ?", journalId);
        }
        jdbcTemplate.update("DELETE FROM cash_receipts WHERE id = ?::uuid", receiptId);
        agingSnapshotRefreshService.refresh();
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
        assertLinesCarryPartner(lines);
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
        assertLinesCarryPartner(lines);
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
