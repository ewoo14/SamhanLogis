package com.samhanair.logis.accounting.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
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
 * TaxInvoiceController IT (Phase 10 Step 8 — P0-4 #3).
 *
 * <p>4 시나리오:
 *
 * <ol>
 *   <li>발행 정상: DRAFT → ISSUED + 자동 분개 생성 (110/255/401)</li>
 *   <li>취소: ISSUED → CANCELLED + 자동 역분개</li>
 *   <li>자동 분개 검증: journals API 로 ISSUED 직후 분개 확인 — 차/대 합계 일치</li>
 *   <li>cancel 역분개 — 신규 역분개도 POSTED 로 보존</li>
 * </ol>
 *
 * <p>외부 client (SlipServiceClient) — 본 IT 미사용이지만 ApplicationContext 등록 의무
 * (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class TaxInvoiceControllerIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    /** 외부 client 격리 — IT 가 slip-service 호출하지 않음. */
    @MockBean private SlipServiceClient slipServiceClient;

    /** SP-09-1 e-Tax client 격리 — Phase 11 NTS 전환 시 IT 실 API 호출 방지 (D2). */
    @MockBean private ETaxClient eTaxClient;
    /** SP-09-4 KFTC 오픈뱅킹 client 격리 — Phase 11 sandbox 전환 시 IT 실 API 호출 방지. */
    @MockBean private KftcClient kftcClient;

    @Test
    @DisplayName("POST /accounting/tax-invoices — ACCOUNTANT 201 DRAFT, SALES 403")
    void createDraftAuth() throws Exception {
        Mockito.lenient().when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any())).thenReturn(0);

        Map<String, Object> body = sampleBody();

        mockMvc.perform(post("/accounting/tax-invoices")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andExpect(jsonPath("$.data.supplyAmount").value(100000.00))
                .andExpect(jsonPath("$.data.vatAmount").value(10000.00))
                .andExpect(jsonPath("$.data.totalAmount").value(110000.00));

        mockMvc.perform(post("/accounting/tax-invoices")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("issue — DRAFT → ISSUED + 자동 분개 (journalId 채워짐, 발행번호 yyyyMMdd-NNNN)")
    void issueGeneratesJournal() throws Exception {
        Mockito.lenient().when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any())).thenReturn(0);

        String id = createDraft();

        MvcResult issueRes = mockMvc.perform(post("/accounting/tax-invoices/" + id + "/issue")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ISSUED"))
                .andExpect(jsonPath("$.data.issuedBy").value("accountant-1"))
                .andExpect(jsonPath("$.data.taxInvoiceNo").exists())
                .andExpect(jsonPath("$.data.journalId").exists())
                .andReturn();

        String journalId = objectMapper.readTree(issueRes.getResponse().getContentAsString())
                .get("data").get("journalId").asText();

        // 자동 분개 검증 — 차/대 합계 일치 (110 외상매출금 110000 / 255 부가세 10000 + 401 매출 100000)
        mockMvc.perform(get("/accounting/journals/" + journalId)
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("POSTED"))
                .andExpect(jsonPath("$.data.totalDebit").value(110000.00))
                .andExpect(jsonPath("$.data.totalCredit").value(110000.00));
    }

    @Test
    @DisplayName("cancel — ISSUED → CANCELLED + 자동 역분개 (P0-4: reason 필수 body 포함)")
    void cancelReverses() throws Exception {
        Mockito.lenient().when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any())).thenReturn(0);

        String id = createDraft();
        // issue
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/issue")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());

        // cancel (P0-4 — reason 필수)
        Map<String, Object> cancelBody = new HashMap<>();
        cancelBody.put("reason", "고객 요청으로 인한 취소");
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/cancel")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cancelBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"))
                .andExpect(jsonPath("$.data.cancelledBy").value("accountant-1"))
                .andExpect(jsonPath("$.data.cancelReason").value("고객 요청으로 인한 취소"))
                .andExpect(jsonPath("$.data.reverseJournalId").exists());
    }

    @Test
    @DisplayName("issue 중복 — ISSUED 상태에서 /{id}/issue 재호출 → 409 CONFLICT")
    void issueAlreadyIssued_409() throws Exception {
        Mockito.lenient().when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any())).thenReturn(0);

        String id = createDraft();

        // 최초 발행 성공
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/issue")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ISSUED"));

        // 동일 세금계산서 재발행 → DRAFT 아니므로 CONFLICT
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/issue")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("update — DRAFT 에서 라인 교체 가능, ISSUED 후 update → 409 CONFLICT")
    void updateDraftOnly() throws Exception {
        Mockito.lenient().when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any())).thenReturn(0);

        String id = createDraft();

        // DRAFT update 정상
        Map<String, Object> updated = sampleBody();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lines = (List<Map<String, Object>>) updated.get("lines");
        lines.get(0).put("unitPrice", new BigDecimal("2000")); // 2000 * 100 = 200000 supply
        mockMvc.perform(put("/accounting/tax-invoices/" + id)
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updated)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.supplyAmount").value(200000.00));

        // issue
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/issue")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());

        // ISSUED update → CONFLICT
        mockMvc.perform(put("/accounting/tax-invoices/" + id)
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updated)))
                .andExpect(status().isConflict());
    }

    private String createDraft() throws Exception {
        Map<String, Object> body = sampleBody();
        MvcResult res = mockMvc.perform(post("/accounting/tax-invoices")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString())
                .get("data").get("id").asText();
    }

    private Map<String, Object> sampleBody() {
        Map<String, Object> line = new HashMap<>();
        line.put("itemName", "운임 기본료");
        line.put("spec", "kg");
        line.put("quantity", new BigDecimal("100"));
        line.put("unitPrice", new BigDecimal("1000"));
        line.put("memo", "5월 분");

        Map<String, Object> body = new HashMap<>();
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerBusinessNo", "123-45-67890");
        body.put("partnerName", "테스트거래처");
        body.put("partnerAddress", "서울시 강남구");
        body.put("supplyDate", "2026-05-04");
        body.put("description", "테스트 세금계산서");
        body.put("lines", List.of(line));
        return body;
    }
}
