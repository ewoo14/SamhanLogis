package com.samhanair.logis.accounting.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
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
 * JournalController + AccountController + TrialBalanceController 권한/라이프사이클 IT.
 *
 * <p>BE endpoint 권한 매트릭스 (Plan §4 + Q9):
 * <ul>
 *   <li>{@code GET    /accounting/accounts}           — ALL_AUTH (200)</li>
 *   <li>{@code POST   /accounting/journals}           — ACCOUNTANT/MASTER (201), SALES/MANAGER 403</li>
 *   <li>{@code GET    /accounting/journals}           — ACCOUNTANT/MASTER (200), SALES 403</li>
 *   <li>{@code GET    /accounting/journals/{id}}      — ACCOUNTANT/MASTER (200)</li>
 *   <li>{@code POST   /accounting/journals/{id}/post} — ACCOUNTANT/MASTER (200), 합계 mismatch 409</li>
 *   <li>{@code POST   /accounting/journals/{id}/reverse} — ACCOUNTANT/MASTER (200), DRAFT 면 409</li>
 * </ul>
 *
 * <p>모든 응답은 ApiResponse 래핑 → jsonPath {@code $.data.*}.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class JournalControllerIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    /** SP-09-1 e-Tax client 격리 — Phase 11 NTS 전환 시 IT 실 API 호출 방지 (D2). */
    @MockBean private ETaxClient eTaxClient;
    /** SP-09-4 KFTC 오픈뱅킹 client 격리 — Phase 11 sandbox 전환 시 IT 실 API 호출 방지. */
    @MockBean private KftcClient kftcClient;
    /**
     * SP-D2 동적 권한 client 격리 — auth-service 호출 차단.
     * 기본값: null 반환 → Spring이 false로 처리 (lenient stub 없음 → fallback 적용).
     */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;
    /**
     * SP-08-FU2 cycle 2 fix (QA P1) — LedgerService / LedgerImageService 가 주입받는 외부 RestClient.
     * Eureka 비활성 IT 환경에서 loadBalancedRestClientBuilder 빈 해석 실패 또는 실 HTTP 호출 회피.
     */
    @MockBean private PartnerLookupClient partnerLookupClient;

    @BeforeEach
    void setUpPartnerLookupStub() {
        lenient().when(partnerLookupClient.findByPartnerId(any())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerCode(any())).thenReturn(Optional.empty());
    }

    @Test
    @DisplayName("GET /accounting/accounts — SALES (ALL_AUTH) 200, 시드 50+ 확인")
    void accountTreeAllAuth() throws Exception {
        mockMvc.perform(get("/accounting/accounts")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(org.hamcrest.Matchers.greaterThanOrEqualTo(50)));
    }

    @Test
    @DisplayName("POST /accounting/journals — ACCOUNTANT 201, SALES 403, MANAGER 403")
    void createJournalAuthMatrix() throws Exception {
        Map<String, Object> body = balancedJournalBody("100000");

        // ACCOUNTANT 201
        mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andExpect(jsonPath("$.data.totalDebit").value(100000))
                .andExpect(jsonPath("$.data.totalCredit").value(100000));

        // SALES 403
        denyDynamicPermissionFor("SALES");
        mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());

        // MANAGER 403 (Q9 — MANAGER 제외)
        denyDynamicPermissionFor("MANAGER");
        mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("POST /accounting/journals — 통제 계정(100) 사용 시 400 INVALID_INPUT")
    void rejectsControlAccount() throws Exception {
        Map<String, Object> body = new HashMap<>(balancedJournalBody("50000"));
        // 라인의 첫 accountCode 를 통제 계정 "100" 으로 변조.
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lines = (List<Map<String, Object>>) body.get("lines");
        lines.get(0).put("accountCode", "100");

        mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("post 라이프사이클 — DRAFT → POSTED + reverse → REVERSED + 신규 역분개 POSTED")
    void postAndReverseLifecycle() throws Exception {
        String id = createJournalAsAccountant("70000");

        // DRAFT → POSTED
        mockMvc.perform(post("/accounting/journals/" + id + "/post")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("POSTED"))
                .andExpect(jsonPath("$.data.postedBy").value("accountant-1"));

        // POSTED → reverse → 신규 역분개 POSTED
        mockMvc.perform(post("/accounting/journals/" + id + "/reverse")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("POSTED"))
                .andExpect(jsonPath("$.data.lines[0].debitAmount").value(0))
                .andExpect(jsonPath("$.data.lines[0].creditAmount").value(70000))
                .andReturn();

        // 원분개 상태 검증
        mockMvc.perform(get("/accounting/journals/" + id)
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("REVERSED"))
                .andExpect(jsonPath("$.data.reversedJournalId").exists());
    }

    @Test
    @DisplayName("post — 차/대 합계 mismatch 시 409 CONFLICT")
    void postMismatchConflict() throws Exception {
        // 라인 1: debit 100000 / 라인 2: credit 90000 → 합계 mismatch
        Map<String, Object> body = balancedJournalBody("100000");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lines = (List<Map<String, Object>>) body.get("lines");
        lines.get(1).put("creditAmount", 90000);

        MvcResult res = mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String id = objectMapper.readTree(res.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(post("/accounting/journals/" + id + "/post")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("reverse — DRAFT 분개에 reverse 호출 시 409 CONFLICT")
    void reverseDraftConflict() throws Exception {
        String id = createJournalAsAccountant("50000");
        mockMvc.perform(post("/accounting/journals/" + id + "/reverse")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict());
    }

    /** 잔여 권한 시나리오 — MASTER 도 200, INVENTORY/WAREHOUSE 403. */
    @Test
    @DisplayName("권한 — MASTER 200, INVENTORY 403")
    void masterAndInventoryAuth() throws Exception {
        Map<String, Object> body = balancedJournalBody("10000");
        // MASTER 201
        mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());

        // INVENTORY 403
        denyDynamicPermissionFor("INVENTORY");
        mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    private String createJournalAsAccountant(String amount) throws Exception {
        Map<String, Object> body = balancedJournalBody(amount);
        MvcResult res = mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString())
                .get("data").get("id").asText();
    }

    private Map<String, Object> balancedJournalBody(String amount) {
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
}
