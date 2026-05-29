package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.eq;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;

import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import java.math.BigDecimal;
import java.util.HashMap;
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
    /**
     * SP-D2 동적 권한 client 격리. SP-D5 cycle 2 fix (P1-4): {@code @RequirePermission} AOP 가
     * 본 IT 의 report endpoint 호출 시 canView=false 로 회귀하지 않도록 lenient stub 적용.
     */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setUpPermissionStub() {
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
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
        denyRequirePermission("accounting.balances.trial-balance", PermissionAction.VIEW);
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

    private Map<String, Object> balancedJournalBody(String amount) {
        Map<String, Object> debitLine = new HashMap<>();
        debitLine.put("accountCode", "101");
        debitLine.put("debitAmount", new BigDecimal(amount));
        debitLine.put("creditAmount", BigDecimal.ZERO);

        Map<String, Object> creditLine = new HashMap<>();
        creditLine.put("accountCode", "401");
        creditLine.put("debitAmount", BigDecimal.ZERO);
        creditLine.put("creditAmount", new BigDecimal(amount));

        Map<String, Object> body = new HashMap<>();
        body.put("journalDate", "2026-05-15");
        body.put("description", "테스트 분개");
        body.put("lines", List.of(debitLine, creditLine));
        return body;
    }
}
