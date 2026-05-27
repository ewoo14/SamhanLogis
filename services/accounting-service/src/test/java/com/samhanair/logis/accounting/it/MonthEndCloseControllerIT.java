package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * MonthEndCloseController IT (Phase 10 Step 8 — P2-4 매출 마감).
 *
 * <p>3 시나리오:
 *
 * <ol>
 *   <li>open/closed 상태: DAILY 마감 → 201 + status CLOSED</li>
 *   <li>마감 후 분개 입력 차단: 동일 일자 분개 POST → 409 (AccountingPeriodGuard)</li>
 *   <li>reverse 권한: ACCOUNTANT 403, MASTER 200</li>
 * </ol>
 *
 * <p>외부 client (SlipServiceClient) {@code @MockBean} 격리 — lockedCount=10 stub.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class MonthEndCloseControllerIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    @MockBean private SlipServiceClient slipServiceClient;
    /** SP-09-1 e-Tax client 격리 — Phase 11 NTS 전환 시 IT 실 API 호출 방지 (D2). */
    @MockBean private ETaxClient eTaxClient;
    /** SP-09-4 KFTC 오픈뱅킹 client 격리 — Phase 11 sandbox 전환 시 IT 실 API 호출 방지. */
    @MockBean private KftcClient kftcClient;
    /** SP-D2 동적 권한 client 격리 — auth-service 호출 차단 (기본값 false = fallback 통과). */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @Test
    @DisplayName("close — DAILY 정상 201, slip-service 호출 + lockedCount stamp")
    void closeDaily() throws Exception {
        Mockito.when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any())).thenReturn(10);

        Map<String, Object> body = new HashMap<>();
        body.put("periodType", "DAILY");
        body.put("periodDate", "2026-05-09");
        body.put("description", "5월 9일 일별 마감");

        mockMvc.perform(post("/accounting/closings")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("CLOSED"))
                .andExpect(jsonPath("$.data.closedBy").value("accountant-1"))
                .andExpect(jsonPath("$.data.lockedSlipCount").value(10));
    }

    @Test
    @DisplayName("마감 후 동일 일자 분개 입력 차단 — AccountingPeriodGuard 409 CONFLICT")
    void postClosingBlocksJournal() throws Exception {
        Mockito.when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any())).thenReturn(0);

        // 1) DAILY 마감
        Map<String, Object> closingBody = new HashMap<>();
        closingBody.put("periodType", "DAILY");
        closingBody.put("periodDate", "2026-05-08");
        mockMvc.perform(post("/accounting/closings")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(closingBody)))
                .andExpect(status().isCreated());

        // 2) 같은 일자 분개 POST → guard 가 409
        mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(balancedJournal("2026-05-08"))))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("list — MANAGER 조회 허용, 마감 실행은 403")
    void managerCanListButCannotClose() throws Exception {
        Mockito.when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any())).thenReturn(0);

        Map<String, Object> closingBody = new HashMap<>();
        closingBody.put("periodType", "MONTHLY");
        closingBody.put("periodDate", "2026-03-01");
        closingBody.put("description", "3월 월말 마감");

        mockMvc.perform(post("/accounting/closings")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(closingBody)))
                .andExpect(status().isCreated());

        mockMvc.perform(get("/accounting/closings")
                        .header("X-User-Id", "manager-1")
                        .header("X-User-Role", "MANAGER")
                        .param("periodType", "MONTHLY")
                        .param("year", "2026"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].periodType").value("MONTHLY"))
                .andExpect(jsonPath("$.data[0].periodDate").value("2026-03-01"))
                .andExpect(jsonPath("$.data[0].status").value("CLOSED"));

        lenient().when(dynamicPermissionClient.canEdit(eq("MANAGER"), anyString())).thenReturn(false);
        mockMvc.perform(post("/accounting/closings")
                        .header("X-User-Id", "manager-1")
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(closingBody)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("reverse — ACCOUNTANT 403, MASTER 200")
    void reverseAuthMatrix() throws Exception {
        Mockito.when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any())).thenReturn(0);

        // 1) 마감 1건 생성
        Map<String, Object> closingBody = new HashMap<>();
        closingBody.put("periodType", "MONTHLY");
        closingBody.put("periodDate", "2026-04-01");
        MvcResult cr = mockMvc.perform(post("/accounting/closings")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(closingBody)))
                .andExpect(status().isCreated())
                .andReturn();
        String id = objectMapper.readTree(cr.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // 2) ACCOUNTANT reverse → 403
        lenient().when(dynamicPermissionClient.canEdit(
                eq("ACCOUNTANT"), eq("accounting.period-close.reverse"))).thenReturn(false);
        mockMvc.perform(post("/accounting/closings/" + id + "/reverse")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isForbidden());

        // 3) MASTER reverse → 200, status OPEN
        mockMvc.perform(post("/accounting/closings/" + id + "/reverse")
                        .header("X-User-Id", "master-1")
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("OPEN"))
                .andExpect(jsonPath("$.data.reversedBy").value("master-1"));
    }

    private Map<String, Object> balancedJournal(String date) {
        Map<String, Object> debitLine = new HashMap<>();
        debitLine.put("accountCode", "101");
        debitLine.put("debitAmount", new BigDecimal("10000"));
        debitLine.put("creditAmount", BigDecimal.ZERO);

        Map<String, Object> creditLine = new HashMap<>();
        creditLine.put("accountCode", "401");
        creditLine.put("debitAmount", BigDecimal.ZERO);
        creditLine.put("creditAmount", new BigDecimal("10000"));

        Map<String, Object> body = new HashMap<>();
        body.put("journalDate", date);
        body.put("description", "마감 차단 테스트");
        body.put("lines", List.of(debitLine, creditLine));
        return body;
    }

    @SuppressWarnings("unused")
    private static UUID anyUuid() {
        return UUID.randomUUID();
    }
}
