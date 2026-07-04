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
 * G-1 받을어음 통합 테스트.
 *
 * <p>실 PostgreSQL + Flyway V40 을 사용해 등록, 상태전이, 목록 필터, 만기 임박순 정렬,
 * enum CHECK 제약을 검증한다.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class NotesReceivableControllerIT extends AbstractPostgresIT {

    private static final String BASE_URL = "/accounting/notes-receivable";
    private static final UUID PARTNER_A_ID = UUID.fromString("00000000-0000-0000-0000-00000000a001");
    private static final UUID PARTNER_B_ID = UUID.fromString("00000000-0000-0000-0000-00000000b001");
    private static final PartnerSummary PARTNER_A =
            new PartnerSummary(PARTNER_A_ID, "P-AR-001", "삼한테스트상사", "123-45-67890", "서울");
    private static final PartnerSummary PARTNER_B =
            new PartnerSummary(PARTNER_B_ID, "P-AR-002", "아로테스트물류", "555-55-55555", "부산");

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
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class)
    private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM notes_receivable");
        lenient().when(partnerLookupClient.findByPartnerCode("P-AR-001"))
                .thenReturn(java.util.Optional.of(PARTNER_A));
        lenient().when(partnerLookupClient.findByPartnerCode("P-AR-002"))
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
    @DisplayName("등록 → 단건 조회: UUID 미노출 + 거래처 표시 식별자 반환")
    void registerAndGetOne_hidesUuid() throws Exception {
        register("NR-001", "P-AR-001", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 7, 10),
                "1000000", "PROMISSORY", "BOARDING");

        mockMvc.perform(get(BASE_URL + "/NR-001")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.noteNo").value("NR-001"))
                .andExpect(jsonPath("$.data.partnerCode").value("P-AR-001"))
                .andExpect(jsonPath("$.data.bizNo").value("1234567890"))
                .andExpect(jsonPath("$.data.partnerName").value("삼한테스트상사"))
                .andExpect(jsonPath("$.data.status").value("BOARDING"))
                .andExpect(jsonPath("$.data.partnerId").doesNotExist())
                .andExpect(jsonPath("$.data.id").doesNotExist());
    }

    @Test
    @DisplayName("상태 전이: BOARDING → COLLECTING → SETTLED")
    void transition_collectAndSettle() throws Exception {
        register("NR-002", "P-AR-001", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 7, 10),
                "2000000", "PROMISSORY", "BOARDING");

        mockMvc.perform(patch(BASE_URL + "/NR-002/status")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"COLLECTING\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("COLLECTING"));

        mockMvc.perform(patch(BASE_URL + "/NR-002/status")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"SETTLED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("SETTLED"));
    }

    @Test
    @DisplayName("목록: 상태/거래처 필터 + 만기 임박순 정렬")
    void transition_rejectsInvalidTransitions() throws Exception {
        register("NR-GUARD-1", "P-AR-001", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 7, 10),
                "2100000", "PROMISSORY", "BOARDING");

        MvcResult boardingRetry = transition("NR-GUARD-1", "BOARDING")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"))
                .andReturn();
        String boardingRetryMessage = objectMapper.readTree(boardingRetry.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .path("message")
                .asText();
        assertThat(boardingRetryMessage).contains("보유").doesNotContain("BOARDING");
        assertPersistedStatus("NR-GUARD-1", "BOARDING");

        transition("NR-GUARD-1", "SETTLED")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("SETTLED"));
        assertPersistedStatus("NR-GUARD-1", "SETTLED");

        transition("NR-GUARD-1", "COLLECTING")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));
        assertPersistedStatus("NR-GUARD-1", "SETTLED");

        transition("NR-GUARD-1", "SETTLED")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));
        assertPersistedStatus("NR-GUARD-1", "SETTLED");

        register("NR-GUARD-2", "P-AR-001", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 7, 10),
                "2200000", "PROMISSORY", "BOARDING");
        transition("NR-GUARD-2", "DISHONORED")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("DISHONORED"));
        assertPersistedStatus("NR-GUARD-2", "DISHONORED");

        transition("NR-GUARD-2", "SETTLED")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONFLICT"));
        assertPersistedStatus("NR-GUARD-2", "DISHONORED");
    }

    @Test
    @DisplayName("register ignores final status payload and persists BOARDING")
    void register_forcesBoardingWhenPayloadContainsFinalStatus() throws Exception {
        postRegister("NR-FINAL-SETTLED", "P-AR-001", LocalDate.of(2026, 6, 2), LocalDate.of(2026, 7, 2),
                        "2300000", "PROMISSORY", "SETTLED")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("BOARDING"));
        assertPersistedStatus("NR-FINAL-SETTLED", "BOARDING");

        postRegister("NR-FINAL-DISHONORED", "P-AR-001", LocalDate.of(2026, 6, 3), LocalDate.of(2026, 7, 3),
                        "2400000", "PROMISSORY", "DISHONORED")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("BOARDING"));
        assertPersistedStatus("NR-FINAL-DISHONORED", "BOARDING");
    }

    @Test
    @DisplayName("list filters by status and partner after dishonor transition")
    void list_filtersAndSortsByMaturityDate() throws Exception {
        register("NR-003", "P-AR-001", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 7, 30),
                "3000000", "PROMISSORY", "BOARDING");
        register("NR-004", "P-AR-001", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 7, 5),
                "4000000", "BILL_OF_EXCHANGE", "BOARDING");
        register("NR-005", "P-AR-002", LocalDate.of(2026, 6, 1), LocalDate.of(2026, 7, 1),
                "5000000", "PROMISSORY", "BOARDING");
        transition("NR-005", "DISHONORED")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("DISHONORED"));

        mockMvc.perform(get(BASE_URL)
                        .param("status", "BOARDING")
                        .param("partnerCode", "P-AR-001")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].noteNo").value("NR-004"))
                .andExpect(jsonPath("$.data[1].noteNo").value("NR-003"));
    }

    @Test
    @DisplayName("bizNo resolve: directory 단일 매칭이면 등록 가능")
    void register_resolvesByBizNo() throws Exception {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("bizNo", "1234567890");
        body.put("noteNo", "NR-006");
        body.put("issueDate", "2026-06-03");
        body.put("maturityDate", "2026-07-03");
        body.put("amount", new BigDecimal("6000000"));
        body.put("noteType", "PROMISSORY");
        body.put("status", "BOARDING");

        mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.partnerCode").value("P-AR-001"));
    }

    @Test
    @DisplayName("CHECK 제약: 잘못된 status native INSERT 거부")
    void checkConstraint_rejectsInvalidStatus() {
        assertThatThrownBy(() -> jdbcTemplate.update("""
                INSERT INTO notes_receivable (
                    id, partner_id, note_no, issue_date, maturity_date, amount,
                    note_type, status, created_at, created_by, is_deleted
                ) VALUES (
                    ?, ?, 'NR-BAD-STATUS', DATE '2026-06-01', DATE '2026-07-01', 1000.00,
                    'PROMISSORY', 'ENDORSED', NOW(), 'it', FALSE
                )
                """, UUID.randomUUID(), PARTNER_A_ID))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private ResultActions postRegister(String noteNo, String partnerCode, LocalDate issueDate, LocalDate maturityDate,
                                       String amount, String noteType, String status) throws Exception {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("partnerCode", partnerCode);
        body.put("noteNo", noteNo);
        body.put("issueDate", issueDate.toString());
        body.put("maturityDate", maturityDate.toString());
        body.put("amount", new BigDecimal(amount));
        body.put("noteType", noteType);
        body.put("status", status);
        body.put("memo", "IT register");

        return mockMvc.perform(post(BASE_URL)
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "ACCOUNTANT")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    private ResultActions transition(String noteNo, String status) throws Exception {
        return mockMvc.perform(patch(BASE_URL + "/" + noteNo + "/status")
                .header("X-User-Id", UUID.randomUUID().toString())
                .header("X-User-Role", "ACCOUNTANT")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"" + status + "\"}"));
    }

    private void assertPersistedStatus(String noteNo, String expectedStatus) {
        String actual = jdbcTemplate.queryForObject(
                "SELECT status FROM notes_receivable WHERE note_no = ? AND is_deleted = FALSE",
                String.class,
                noteNo);
        assertThat(actual).isEqualTo(expectedStatus);
    }

    private void register(String noteNo, String partnerCode, LocalDate issueDate, LocalDate maturityDate,
                          String amount, String noteType, String status) throws Exception {
        Map<String, Object> body = new java.util.LinkedHashMap<>();
        body.put("partnerCode", partnerCode);
        body.put("noteNo", noteNo);
        body.put("issueDate", issueDate.toString());
        body.put("maturityDate", maturityDate.toString());
        body.put("amount", new BigDecimal(amount));
        body.put("noteType", noteType);
        body.put("status", status);
        body.put("memo", "IT 등록");

        mockMvc.perform(post(BASE_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());
    }
}
