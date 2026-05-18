package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import java.util.HashMap;
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
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * 일마감 + 원장 endpoint IT (SP-08-6-5).
 *
 * <p>8 시나리오:
 * <ol>
 *   <li>일마감 생성 (전체 거래처) → 201 + isLocked=true</li>
 *   <li>동일 날짜 재마감 → 409 CONFLICT</li>
 *   <li>SALES role 일마감 → 403</li>
 *   <li>기간 조회 GET → 200 + 페이지 결과</li>
 *   <li>거래처코드 포함 일마감 → 201 (partner-service stub)</li>
 *   <li>없는 거래처코드 → 404</li>
 *   <li>원장 조회 (전체) → 200</li>
 *   <li>원장 조회 거래처 필터 → 200 (partner-service stub)</li>
 * </ol>
 *
 * <p>외부 client 전체 {@code @MockBean} 격리 (메모리 가드
 * {@code feedback_it_mockbean_external_clients.md}).
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class DailyClosingIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    // ── 외부 client @MockBean 격리 (전부 선언 필수) ──────────────────────────
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;

    private static final String ACCOUNTANT_ID = "accountant-user";
    private static final String SALES_ID = "sales-user";
    private static final String MASTER_ID = "master-user";
    private static final String PARTNER_CODE = "PC001";
    private static final UUID PARTNER_UUID = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    @BeforeEach
    void stubExternalClients() {
        // SlipServiceClient lenient stub
        Mockito.lenient()
                .when(slipServiceClient.lockByPeriod(any(), any()))
                .thenReturn(0);

        // PartnerLookupClient — 존재하는 거래처 stub
        PartnerSummary stubPartner = new PartnerSummary(
                PARTNER_UUID, PARTNER_CODE, "테스트거래처", "123-45-67890", "서울시");
        Mockito.lenient()
                .when(partnerLookupClient.findByPartnerCode(PARTNER_CODE))
                .thenReturn(Optional.of(stubPartner));
        Mockito.lenient()
                .when(partnerLookupClient.findByPartnerCode("NOTEXIST"))
                .thenReturn(Optional.empty());
        Mockito.lenient()
                .when(partnerLookupClient.findByPartnerId(any(UUID.class)))
                .thenReturn(Optional.empty());

        // ProductClient — lookup 은 UUID 리스트 기반 batch. 본 IT 에서 직접 호출 없음.
        // @MockBean 으로 ApplicationContext 격리만 보장 (lenient stub 불필요).

        // ChatRoomMappingClient lenient stub
        Mockito.lenient()
                .when(chatRoomMappingClient.findChatRoomNamesByPartnerCode(anyString()))
                .thenReturn(java.util.List.of());
    }

    // ── 1. 일마감 생성 (전체 거래처) → 201 ──────────────────────────────────

    @Test
    @DisplayName("일마감 생성 — 전체 거래처 201 + isLocked=true")
    void testCreateDailyClosingForDate() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", "2026-05-10");

        mockMvc.perform(post("/api/v1/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.closingDate").value("2026-05-10"))
                .andExpect(jsonPath("$.data.isLocked").value(true))
                .andExpect(jsonPath("$.data.lockedBy").value(ACCOUNTANT_ID));
    }

    // ── 2. 동일 날짜 재마감 → 409 ────────────────────────────────────────────

    @Test
    @DisplayName("일마감 중복 실행 — 409 CONFLICT")
    void testCreateDailyClosingDuplicate() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", "2026-05-11");

        // 첫 번째 마감
        mockMvc.perform(post("/api/v1/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());

        // 동일 날짜 재시도 → 409
        mockMvc.perform(post("/api/v1/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isConflict());
    }

    // ── 3. SALES role → 403 ──────────────────────────────────────────────────

    @Test
    @DisplayName("일마감 — SALES role 403 Forbidden")
    void testCreateDailyClosingForbiddenForSales() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", "2026-05-12");

        mockMvc.perform(post("/api/v1/accounting/daily-closings")
                        .header("X-User-Id", SALES_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    // ── 4. 기간 조회 GET → 200 ───────────────────────────────────────────────

    @Test
    @DisplayName("일마감 기간 조회 GET — 200 페이지 결과")
    void testGetDailyClosingsRange() throws Exception {
        // 마감 1건 생성
        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", "2026-05-13");
        mockMvc.perform(post("/api/v1/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());

        // 기간 조회
        mockMvc.perform(get("/api/v1/accounting/daily-closings")
                        .param("from", "2026-05-01")
                        .param("to", "2026-05-31")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.totalElements").isNumber());
    }

    // ── 5. 거래처코드 포함 일마감 → 201 ─────────────────────────────────────

    @Test
    @DisplayName("일마감 — 거래처코드 지정 201 (partner-service stub)")
    void testCreateDailyClosingWithPartner() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", "2026-05-14");
        body.put("partnerCode", PARTNER_CODE);

        mockMvc.perform(post("/api/v1/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.partnerCode").value(PARTNER_CODE))
                .andExpect(jsonPath("$.data.isLocked").value(true));
    }

    // ── 6. 없는 거래처코드 → 404 ─────────────────────────────────────────────

    @Test
    @DisplayName("일마감 — 없는 거래처코드 404")
    void testCreateDailyClosingPartnerNotFound() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", "2026-05-15");
        body.put("partnerCode", "NOTEXIST");

        mockMvc.perform(post("/api/v1/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isNotFound());
    }

    // ── 7. 원장 조회 (전체 거래처) → 200 ────────────────────────────────────

    @Test
    @DisplayName("원장 조회 전체 거래처 — 200")
    void testGetLedgersAllPartners() throws Exception {
        mockMvc.perform(get("/api/v1/accounting/ledgers")
                        .param("from", "2026-05-01")
                        .param("to", "2026-05-31")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.periodFrom").value("2026-05-01"))
                .andExpect(jsonPath("$.data.periodTo").value("2026-05-31"))
                .andExpect(jsonPath("$.data.lines").isArray());
    }

    // ── 8. 원장 조회 거래처 필터 → 200 ──────────────────────────────────────

    @Test
    @DisplayName("원장 조회 거래처 필터 — 200 (partner-service stub)")
    void testGetLedgersWithPartnerFilter() throws Exception {
        mockMvc.perform(get("/api/v1/accounting/ledgers")
                        .param("from", "2026-05-01")
                        .param("to", "2026-05-31")
                        .param("partnerCode", PARTNER_CODE)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.partnerCode").value(PARTNER_CODE))
                .andExpect(jsonPath("$.data.lines").isArray());
    }
}
