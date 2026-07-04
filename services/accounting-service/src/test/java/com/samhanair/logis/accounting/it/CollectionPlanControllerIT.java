package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipQueryClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

/**
 * G-2 수금계획 통합 테스트.
 *
 * <p>실 PostgreSQL + Flyway V41 을 사용해 등록, 상태전이 가드, 목록 필터,
 * 미수/어음 기반 자동 제안, 월별 예측 집계, enum CHECK 제약을 검증한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class CollectionPlanControllerIT extends AbstractPostgresIT {

    private static final String BASE_URL = "/accounting/collection-plans";
    private static final UUID PARTNER_A_ID = UUID.fromString("00000000-0000-0000-0000-00000000a101");
    private static final UUID PARTNER_B_ID = UUID.fromString("00000000-0000-0000-0000-00000000b101");
    private static final PartnerSummary PARTNER_A =
            new PartnerSummary(PARTNER_A_ID, "P-CP-001", "삼한수금상사", "123-45-67890", "서울");
    private static final PartnerSummary PARTNER_B =
            new PartnerSummary(PARTNER_B_ID, "P-CP-002", "아로수금물류", "555-55-55555", "부산");

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private JdbcTemplate jdbcTemplate;

    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private SlipQueryClient slipQueryClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;
    @MockBean(classes = DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM collection_plan");
        jdbcTemplate.update("DELETE FROM collection_plan_number_sequences");
        jdbcTemplate.update("DELETE FROM notes_receivable WHERE note_no LIKE 'CP-NR-%'");
        jdbcTemplate.update("DELETE FROM journal_lines WHERE memo LIKE 'CP-IT-%'");
        jdbcTemplate.update("DELETE FROM journals WHERE journal_no LIKE 'CP-IT-%'");

        lenient().when(partnerLookupClient.findByPartnerCode("P-CP-001"))
                .thenReturn(java.util.Optional.of(PARTNER_A));
        lenient().when(partnerLookupClient.findByPartnerCode("P-CP-002"))
                .thenReturn(java.util.Optional.of(PARTNER_B));
        lenient().when(partnerLookupClient.findByPartnerId(PARTNER_A_ID))
                .thenReturn(java.util.Optional.of(PARTNER_A));
        lenient().when(partnerLookupClient.findByPartnerId(PARTNER_B_ID))
                .thenReturn(java.util.Optional.of(PARTNER_B));
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(any()))
                .thenReturn(Map.of(PARTNER_A_ID, PARTNER_A, PARTNER_B_ID, PARTNER_B));
        lenient().when(partnerLookupClient.searchDirectory("1234567890", 2))
                .thenReturn(List.of(PARTNER_A));
    }

    @Test
    @DisplayName("등록 → 목록: UUID 미노출 + 거래처 표시 식별자 반환")
    void registerAndList_hidesUuid() throws Exception {
        String planNo = register("P-CP-001", LocalDate.of(2026, 7, 5), "1200000", "MANUAL");

        mockMvc.perform(get(BASE_URL)
                        .param("partnerCode", "P-CP-001")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].planNo").value(planNo))
                .andExpect(jsonPath("$.data[0].partnerCode").value("P-CP-001"))
                .andExpect(jsonPath("$.data[0].bizNo").value("1234567890"))
                .andExpect(jsonPath("$.data[0].partnerName").value("삼한수금상사"))
                .andExpect(jsonPath("$.data[0].status").value("PLANNED"))
                .andExpect(jsonPath("$.data[0].partnerId").doesNotExist())
                .andExpect(jsonPath("$.data[0].id").doesNotExist());
    }

    @Test
    @DisplayName("채번: 수금계획 번호는 plannedDate 기준 yyyy/MM/dd-N 일자별 순차 번호")
    void register_assignsSequentialSlashPlanNoPerPlannedDate() throws Exception {
        String first = register("P-CP-001", LocalDate.of(2026, 12, 24), "1200000", "MANUAL");
        String second = register("P-CP-001", LocalDate.of(2026, 12, 24), "1300000", "MANUAL");

        assertThat(first).isEqualTo("2026/12/24-1");
        assertThat(second).isEqualTo("2026/12/24-2");
    }

    @Test
    @DisplayName("상태 전이 가드: PLANNED → OVERDUE → COLLECTED, terminal/역전이 거부")
    void transition_rejectsInvalidTransitions() throws Exception {
        String planNo = register("P-CP-001", LocalDate.of(2026, 7, 10), "1300000", "MANUAL");

        transition(planNo, "OVERDUE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("OVERDUE"));
        assertPersistedStatus(planNo, "OVERDUE");

        MvcResult plannedRetry = transition(planNo, "PLANNED")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"))
                .andReturn();
        String plannedRetryMessage = objectMapper.readTree(plannedRetry.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("message")
                .asText();
        assertThat(plannedRetryMessage).contains("예정").doesNotContain("PLANNED");
        assertPersistedStatus(planNo, "OVERDUE");

        transition(planNo, "COLLECTED")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COLLECTED"));
        assertPersistedStatus(planNo, "COLLECTED");

        transition(planNo, "OVERDUE")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));
        assertPersistedStatus(planNo, "COLLECTED");

        transition(planNo, "COLLECTED")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));
        assertPersistedStatus(planNo, "COLLECTED");
    }

    @Test
    @DisplayName("목록: 상태/거래처 필터 + 예정일 오름차순 정렬")
    void list_filtersAndSortsByPlannedDate() throws Exception {
        register("P-CP-001", LocalDate.of(2026, 8, 20), "2100000", "MANUAL");
        register("P-CP-001", LocalDate.of(2026, 8, 5), "2200000", "RECEIVABLE_BALANCE");
        String other = register("P-CP-002", LocalDate.of(2026, 8, 1), "2300000", "MANUAL");
        transition(other, "OVERDUE").andExpect(status().isOk());

        mockMvc.perform(get(BASE_URL)
                        .param("status", "PLANNED")
                        .param("partnerCode", "P-CP-001")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].plannedDate").value("2026-08-05"))
                .andExpect(jsonPath("$.data[1].plannedDate").value("2026-08-20"));
    }

    @Test
    @DisplayName("자동 제안: 외상매출금 잔액 + 받을어음 만기 후보 생성")
    void suggestions_fromReceivableBalanceAndNotes() throws Exception {
        insertPostedReceivableJournal(PARTNER_A_ID, new BigDecimal("5000000"), new BigDecimal("1250000"));
        insertNote("CP-NR-001", PARTNER_A_ID, LocalDate.now().plusDays(15), new BigDecimal("700000"));
        insertNote("CP-NR-002", PARTNER_A_ID, LocalDate.now().minusDays(3), new BigDecimal("300000"));

        mockMvc.perform(get(BASE_URL + "/suggestions")
                        .param("partnerCode", "P-CP-001")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(3))
                .andExpect(jsonPath("$.data[?(@.basis=='RECEIVABLE_BALANCE')].plannedAmount")
                        .value(org.hamcrest.Matchers.contains(3750000.0)))
                .andExpect(jsonPath("$.data[?(@.basis=='NOTE_MATURITY')].sourceReference")
                        .value(org.hamcrest.Matchers.containsInAnyOrder("CP-NR-001", "CP-NR-002")))
                .andExpect(jsonPath("$.data[0].partnerId").doesNotExist())
                .andExpect(jsonPath("$.data[0].id").doesNotExist());
    }

    @Test
    @DisplayName("자동 제안 적용 등록: sourceReference 영속 + 같은 어음 만기 중복 등록 거부")
    void registerSuggestion_persistsSourceReferenceAndRejectsDuplicateOpenPlan() throws Exception {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("partnerCode", "P-CP-001");
        body.put("plannedDate", "2026-08-15");
        body.put("plannedAmount", new BigDecimal("800000"));
        body.put("basis", "NOTE_MATURITY");
        body.put("sourceReference", "CP-NR-DUP-001");
        body.put("memo", "받을어음 만기 기준 자동 제안");

        mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.sourceReference").value("CP-NR-DUP-001"));

        Integer persisted = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                  FROM collection_plan
                 WHERE partner_id = ?
                   AND basis = 'NOTE_MATURITY'
                   AND source_reference = 'CP-NR-DUP-001'
                   AND status = 'PLANNED'
                   AND is_deleted = FALSE
                """, Integer.class, PARTNER_A_ID);
        assertThat(persisted).isEqualTo(1);

        mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));
    }

    @Test
    @DisplayName("예측: PLANNED/OVERDUE만 월별 합산하고 COLLECTED 제외")
    void forecast_groupsOpenPlansByMonth() throws Exception {
        register("P-CP-001", LocalDate.of(2026, 9, 5), "1000000", "MANUAL");
        String overdue = register("P-CP-001", LocalDate.of(2026, 9, 20), "2000000", "MANUAL");
        String collected = register("P-CP-001", LocalDate.of(2026, 10, 5), "3000000", "MANUAL");
        register("P-CP-001", LocalDate.of(2026, 10, 15), "4000000", "MANUAL");
        transition(overdue, "OVERDUE").andExpect(status().isOk());
        transition(collected, "COLLECTED").andExpect(status().isOk());

        mockMvc.perform(get(BASE_URL + "/forecast")
                        .param("from", "2026-09-01")
                        .param("to", "2026-10-31")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalAmount").value(7000000.00))
                .andExpect(jsonPath("$.data.months[0].month").value("2026-09"))
                .andExpect(jsonPath("$.data.months[0].plannedAmount").value(3000000.00))
                .andExpect(jsonPath("$.data.months[1].month").value("2026-10"))
                .andExpect(jsonPath("$.data.months[1].plannedAmount").value(4000000.00));
    }

    @Test
    @DisplayName("bizNo resolve: directory 단일 매칭이면 등록 가능")
    void register_resolvesByBizNo() throws Exception {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("bizNo", "1234567890");
        body.put("plannedDate", "2026-11-03");
        body.put("plannedAmount", new BigDecimal("6000000"));
        body.put("basis", "MANUAL");

        mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.partnerCode").value("P-CP-001"));
    }

    @Test
    @DisplayName("CHECK 제약: 잘못된 basis/status native INSERT 거부")
    void checkConstraint_rejectsInvalidEnums() {
        assertThatThrownBy(() -> nativeInsertCollectionPlan("CP-BAD-BASIS", "SALES_ORDER", "PLANNED"))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThatThrownBy(() -> nativeInsertCollectionPlan("CP-BAD-STATUS", "MANUAL", "CANCELLED"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private String register(String partnerCode, LocalDate plannedDate, String amount, String basis) throws Exception {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("partnerCode", partnerCode);
        body.put("plannedDate", plannedDate.toString());
        body.put("plannedAmount", new BigDecimal(amount));
        body.put("basis", basis);
        body.put("memo", "IT 등록");

        MvcResult result = mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode root = objectMapper.readTree(result.getResponse().getContentAsString());
        String planNo = root.path("data").path("planNo").asText();
        assertThat(planNo).matches("\\d{4}/\\d{2}/\\d{2}-\\d+");
        return planNo;
    }

    private ResultActions transition(String planNo, String status) throws Exception {
        return mockMvc.perform(patch(BASE_URL + "/" + planNo + "/status")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "ACCOUNTANT")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"" + status + "\"}"));
    }

    private void assertPersistedStatus(String planNo, String expectedStatus) {
        String actual = jdbcTemplate.queryForObject(
                "SELECT status FROM collection_plan WHERE plan_no = ? AND is_deleted = FALSE",
                String.class,
                planNo);
        assertThat(actual).isEqualTo(expectedStatus);
    }

    private void insertPostedReceivableJournal(UUID partnerId, BigDecimal debit, BigDecimal credit) {
        UUID journalId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO journals (
                    id, journal_no, journal_date, description, source_type, status,
                    posted_at, posted_by, version, created_at, created_by, is_deleted
                ) VALUES (?, ?, ?, 'CP IT receivable', 'MANUAL', 'POSTED',
                    NOW(), 'it', 0, NOW(), 'it', FALSE)
                """, journalId, "CP-IT-" + journalId.toString().substring(0, 8), LocalDate.now());
        if (debit.signum() > 0) {
            insertJournalLine(journalId, 1, "110", debit, BigDecimal.ZERO, partnerId);
        }
        if (credit.signum() > 0) {
            insertJournalLine(journalId, 2, "110", BigDecimal.ZERO, credit, partnerId);
        }
    }

    private void insertJournalLine(UUID journalId, int lineNo, String accountCode,
                                   BigDecimal debit, BigDecimal credit, UUID partnerId) {
        jdbcTemplate.update("""
                INSERT INTO journal_lines (
                    id, journal_id, line_no, account_code, debit_amount, credit_amount,
                    partner_id, memo, created_at, created_by, is_deleted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'CP-IT-line', NOW(), 'it', FALSE)
                """, UUID.randomUUID(), journalId, lineNo, accountCode, debit, credit, partnerId);
    }

    private void insertNote(String noteNo, UUID partnerId, LocalDate maturityDate, BigDecimal amount) {
        jdbcTemplate.update("""
                INSERT INTO notes_receivable (
                    id, partner_id, note_no, issue_date, maturity_date, amount,
                    note_type, status, memo, created_at, created_by, is_deleted
                ) VALUES (?, ?, ?, ?, ?, ?, 'PROMISSORY', 'BOARDING', 'CP IT note', NOW(), 'it', FALSE)
                """, UUID.randomUUID(), partnerId, noteNo, maturityDate.minusDays(30), maturityDate, amount);
    }

    private void nativeInsertCollectionPlan(String planNo, String basis, String status) {
        jdbcTemplate.update("""
                INSERT INTO collection_plan (
                    id, plan_no, partner_id, planned_date, planned_amount,
                    basis, status, created_at, created_by, is_deleted
                ) VALUES (
                    ?, ?, ?, DATE '2026-12-01', 1000.00,
                    ?, ?, NOW(), 'it', FALSE
                )
                """, UUID.randomUUID(), planNo, PARTNER_A_ID, basis, status);
    }
}
