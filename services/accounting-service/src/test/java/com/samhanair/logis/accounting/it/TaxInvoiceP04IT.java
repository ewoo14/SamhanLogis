package com.samhanair.logis.accounting.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.DynamicPermissionClient;
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
 * P0-4 세금계산서 신규 endpoint IT.
 *
 * <p>커버 시나리오 (4건):
 *
 * <ol>
 *   <li>POST /issue-request — P0-4 DTO DRAFT 생성 201, SALES + invoiceType 반환</li>
 *   <li>POST /issue-request — 사업자번호 형식 오류 400</li>
 *   <li>GET /{id}/print — ISSUED 상태 인쇄 데이터 200, 한글 금액 포함</li>
 *   <li>GET /history — type=SALES 필터 200, Slice C 페이지 응답</li>
 * </ol>
 *
 * <p>외부 client {@link SlipServiceClient} — IT 격리 (@MockBean lenient).
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class TaxInvoiceP04IT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    @MockBean private SlipServiceClient slipServiceClient;

    /** SP-09-1 e-Tax client 격리 — Phase 11 NTS 전환 시 IT 실 API 호출 방지 (D2). */
    @MockBean private ETaxClient eTaxClient;
    /** SP-09-4 KFTC 오픈뱅킹 client 격리 — Phase 11 sandbox 전환 시 IT 실 API 호출 방지. */
    @MockBean private KftcClient kftcClient;
    /** SP-D2 동적 권한 client 격리 — auth-service 호출 차단 (기본값 false = fallback 통과). */
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    // ── 시나리오 1 ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("POST /accounting/tax-invoices/issue-request — P0-4 DTO 201, SALES, 합계 정확")
    void issueRequest_creates201Draft() throws Exception {
        Mockito.lenient().when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any()))
                .thenReturn(0);

        Map<String, Object> body = sampleP04Body("SALES");

        mockMvc.perform(post("/accounting/tax-invoices/issue-request")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andExpect(jsonPath("$.data.invoiceType").value("SALES"))
                .andExpect(jsonPath("$.data.partnerCode").value("P-001"))
                .andExpect(jsonPath("$.data.supplyAmount").value(100000.00))
                .andExpect(jsonPath("$.data.vatAmount").value(10000.00))
                .andExpect(jsonPath("$.data.totalAmount").value(110000.00));
    }

    // ── 시나리오 2 ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("POST /accounting/tax-invoices/issue-request — 사업자번호 형식 오류 400")
    void issueRequest_invalidBusinessNumber_400() throws Exception {
        Mockito.lenient().when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any()))
                .thenReturn(0);

        Map<String, Object> body = sampleP04Body("SALES");
        body.put("partnerBusinessNumber", "1234567890");  // 하이픈 없음 — 형식 오류

        mockMvc.perform(post("/accounting/tax-invoices/issue-request")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    // ── 시나리오 3 ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("GET /{id}/print — ISSUED 상태 인쇄 데이터, 한글 금액 포함")
    void print_issuedInvoice_200() throws Exception {
        Mockito.lenient().when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any()))
                .thenReturn(0);

        String id = createP04DraftAndIssue();

        mockMvc.perform(get("/accounting/tax-invoices/" + id + "/print")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.supplierName").exists())
                .andExpect(jsonPath("$.data.recipientName").value("테스트거래처"))
                .andExpect(jsonPath("$.data.totalAmount").value(110000.00))
                .andExpect(jsonPath("$.data.totalAmountKorean").value(
                        org.hamcrest.Matchers.startsWith("일금")))
                .andExpect(jsonPath("$.data.lines").isArray())
                .andExpect(jsonPath("$.data.lines[0].unit").value("건"));
    }

    // ── 시나리오 4 ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("GET /accounting/tax-invoices/history — type=SALES 200, Slice C 페이지")
    void history_typeSalesFilter_200() throws Exception {
        Mockito.lenient().when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any()))
                .thenReturn(0);

        // ISSUED 상태 데이터 1건 준비
        createP04DraftAndIssue();

        mockMvc.perform(get("/accounting/tax-invoices/history")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT")
                        .param("status", "ISSUED")
                        .param("type", "SALES")
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.totalElements").isNumber());
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────────────

    /** P0-4 DTO 기반 sample body 생성. */
    private Map<String, Object> sampleP04Body(String invoiceType) {
        Map<String, Object> line = new HashMap<>();
        line.put("itemName", "운임 기본료");
        line.put("specification", "kg");
        line.put("quantity", new BigDecimal("100"));
        line.put("unit", "건");
        line.put("unitPrice", new BigDecimal("1000"));

        Map<String, Object> body = new HashMap<>();
        body.put("invoiceType", invoiceType);
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerCode", "P-001");
        body.put("partnerName", "테스트거래처");
        body.put("partnerBusinessNumber", "123-45-67890");
        body.put("issueDate", "2026-05-11");
        body.put("memo", "P0-4 테스트");
        body.put("lines", List.of(line));
        return body;
    }

    /** P0-4 DTO 로 DRAFT 생성 → issue → id 반환. */
    private String createP04DraftAndIssue() throws Exception {
        Map<String, Object> body = sampleP04Body("SALES");
        MvcResult res = mockMvc.perform(post("/accounting/tax-invoices/issue-request")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        String id = objectMapper.readTree(res.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/issue")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());

        return id;
    }
}
