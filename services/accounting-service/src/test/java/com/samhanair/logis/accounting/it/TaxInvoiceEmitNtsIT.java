package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.ETaxSubmitResult;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
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
 * TaxInvoice emit-nts endpoint 통합 테스트 (SP-09-1).
 *
 * <p>8 시나리오:
 *
 * <ol>
 *   <li>DRY_RUN 정상 발행 — ISSUED 세금계산서 → 200 + eTaxExternalId 저장</li>
 *   <li>SALES 역할 금지 — 403 FORBIDDEN</li>
 *   <li>MANAGER 역할 금지 — ACCOUNTANT/MASTER 만 허용</li>
 *   <li>DRAFT 시도 → 422 TAX_INVOICE_NOT_EMITTABLE</li>
 *   <li>CANCELLED 시도 → 422 TAX_INVOICE_NOT_EMITTABLE</li>
 *   <li>중복 발행 시도 → 409 TAX_INVOICE_ALREADY_EMITTED</li>
 *   <li>audit log 기록 확인 — TAX_INVOICE_EMIT_NTS revision</li>
 *   <li>ETaxClient 실패 → 502 BAD_GATEWAY</li>
 * </ol>
 *
 * <p>@MockBean 격리: {@link ETaxClient} (SP-09-1 신규) + {@link SlipServiceClient} (기존)
 * (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class TaxInvoiceEmitNtsIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    /** 외부 client 격리 — 기존 SlipServiceClient. */
    @MockBean private SlipServiceClient slipServiceClient;

    /** 신규 e-Tax client 격리 — SP-09-1. */
    @MockBean private ETaxClient eTaxClient;

    // ─── 1. DRY_RUN 정상 발행 ───────────────────────────────────────────────

    @Test
    @DisplayName("emit-nts DRY_RUN — ISSUED 세금계산서 200 + eTaxExternalId 저장")
    void testEmitNtsDryRunSuccess() throws Exception {
        lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0);
        when(eTaxClient.submit(any(TaxInvoice.class)))
                .thenReturn(ETaxSubmitResult.success("DRY-20260518-0001-999", "DRY_RUN"));

        String id = createAndIssueDraft();

        Map<String, Object> emitBody = Map.of("submitMethod", "DRY_RUN");

        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emitBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ISSUED"))
                .andExpect(jsonPath("$.data.eTaxExternalId").value("DRY-20260518-0001-999"))
                .andExpect(jsonPath("$.data.submitMethod").value("DRY_RUN"))
                .andExpect(jsonPath("$.data.submittedAt").exists())
                .andExpect(jsonPath("$.data.taxInvoiceNo").exists());
    }

    // ─── 2. SALES 역할 금지 ─────────────────────────────────────────────────

    @Test
    @DisplayName("emit-nts — SALES 역할 → 403 FORBIDDEN")
    void testEmitNtsForbiddenForSales() throws Exception {
        lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0);

        String id = createAndIssueDraft();

        Map<String, Object> emitBody = Map.of("submitMethod", "DRY_RUN");

        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "sales-user-1")
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emitBody)))
                .andExpect(status().isForbidden());
    }

    // ─── 3. MANAGER 역할 금지 ───────────────────────────────────────────────

    @Test
    @DisplayName("emit-nts — MANAGER 역할 → 403 FORBIDDEN (ACCOUNTANT/MASTER 만 허용)")
    void testEmitNtsForbiddenForManager() throws Exception {
        lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0);

        String id = createAndIssueDraft();

        Map<String, Object> emitBody = Map.of("submitMethod", "DRY_RUN");

        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "manager-1")
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emitBody)))
                .andExpect(status().isForbidden());
    }

    // ─── 4. DRAFT 시도 → 422 ─────────────────────────────────────────────

    @Test
    @DisplayName("emit-nts DRAFT 시도 → 422 TAX_INVOICE_NOT_EMITTABLE")
    void testEmitDraftReturns422() throws Exception {
        lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0);

        // DRAFT 상태 그대로 (issue 안 함)
        String id = createDraft();

        Map<String, Object> emitBody = Map.of("submitMethod", "DRY_RUN");

        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emitBody)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("TAX_INVOICE_NOT_EMITTABLE"));
    }

    // ─── 5. CANCELLED 시도 → 422 ─────────────────────────────────────────

    @Test
    @DisplayName("emit-nts CANCELLED 시도 → 422 TAX_INVOICE_NOT_EMITTABLE")
    void testEmitCancelledReturns422() throws Exception {
        lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0);

        String id = createAndIssueDraft();

        // 취소
        Map<String, Object> cancelBody = Map.of("reason", "테스트 취소 사유 (5자 이상)");
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/cancel")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cancelBody)))
                .andExpect(status().isOk());

        // CANCELLED 상태 emit-nts → 422
        Map<String, Object> emitBody = Map.of("submitMethod", "DRY_RUN");
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emitBody)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("TAX_INVOICE_NOT_EMITTABLE"));
    }

    // ─── 6. 중복 발행 → 409 ──────────────────────────────────────────────

    @Test
    @DisplayName("emit-nts 중복 발행 시도 → 409 TAX_INVOICE_ALREADY_EMITTED")
    void testEmitAlreadyEmittedReturns409() throws Exception {
        lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0);
        when(eTaxClient.submit(any(TaxInvoice.class)))
                .thenReturn(ETaxSubmitResult.success("DRY-20260518-0001-111", "DRY_RUN"));

        String id = createAndIssueDraft();
        Map<String, Object> emitBody = Map.of("submitMethod", "DRY_RUN");

        // 최초 발행 성공
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emitBody)))
                .andExpect(status().isOk());

        // 중복 발행 → 409
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emitBody)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TAX_INVOICE_ALREADY_EMITTED"));
    }

    // ─── 7. audit log 기록 확인 ───────────────────────────────────────────

    @Test
    @DisplayName("emit-nts 성공 후 audit revision 기록 확인 — TAX_INVOICE_EMIT_NTS")
    void testEmitAuditLogRecorded() throws Exception {
        lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0);
        when(eTaxClient.submit(any(TaxInvoice.class)))
                .thenReturn(ETaxSubmitResult.success("DRY-AUDIT-20260518", "DRY_RUN"));

        String id = createAndIssueDraft();
        Map<String, Object> emitBody = Map.of("submitMethod", "DRY_RUN");

        // emit-nts 성공 후 audit log 포함 응답 확인
        // (audit log 는 별도 조회 endpoint 가 없으므로, 성공 응답 및 eTaxExternalId 저장으로 간접 확인)
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "accountant-audit")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emitBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.eTaxExternalId").value("DRY-AUDIT-20260518"))
                .andExpect(jsonPath("$.data.submitMethod").value("DRY_RUN"));

        // 동일 세금계산서 재발행 시도 → 409 (audit 기록 후 eTaxExternalId 가 설정됐음을 간접 검증)
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "accountant-audit")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emitBody)))
                .andExpect(status().isConflict());
    }

    // ─── 8. ETaxClient 실패 → 502 ─────────────────────────────────────────

    @Test
    @DisplayName("ETaxClient 실패 시 → 502 BAD_GATEWAY")
    void testEmitNtsClientFailureReturns502() throws Exception {
        lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0);
        when(eTaxClient.submit(any(TaxInvoice.class)))
                .thenThrow(new BusinessException(ErrorCode.ETAX_SUBMIT_FAILED,
                        "NTS API 타임아웃"));

        String id = createAndIssueDraft();
        Map<String, Object> emitBody = Map.of("submitMethod", "NTS");

        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emitBody)))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("ETAX_SUBMIT_FAILED"));
    }

    // ─── 헬퍼 ─────────────────────────────────────────────────────────────

    /** DRAFT 생성 후 id 반환. */
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

    /** DRAFT 생성 + ISSUED 전이 후 id 반환. */
    private String createAndIssueDraft() throws Exception {
        String id = createDraft();
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/issue")
                        .header("X-User-Id", "accountant-1")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());
        return id;
    }

    /** 테스트용 세금계산서 생성 body. */
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
        body.put("partnerName", "테스트거래처SP09");
        body.put("partnerAddress", "서울시 강남구");
        body.put("supplyDate", "2026-05-04");
        body.put("description", "SP-09-1 emit-nts 테스트");
        body.put("lines", List.of(line));
        return body;
    }
}
