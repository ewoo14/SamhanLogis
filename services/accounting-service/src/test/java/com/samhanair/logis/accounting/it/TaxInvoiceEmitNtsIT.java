package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.audit.domain.AccountingAuditLog;
import com.samhanair.logis.accounting.audit.repository.AccountingAuditLogRepository;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.ETaxSubmitResult;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.permission.PermissionAction;
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
 *   <li>audit log 기록 확인 — TAX_INVOICE_EMIT_NTS revision (repository 직접 검증)</li>
 *   <li>ETaxClient 실패 → 502 BAD_GATEWAY</li>
 * </ol>
 *
 * <p>@MockBean 격리: {@link ETaxClient} (SP-09-1 신규) + {@link SlipServiceClient} (기존)
 * (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 *
 * <p>Case 7 audit 직접 검증: {@code recordEmitAudit} 는 현재 동일 트랜잭션 내에서 실행된다
 * (self-invocation 으로 REQUIRES_NEW 미적용). @Transactional 테스트가 롤백되면 audit row 도
 * 함께 롤백된다 — audit 트랜잭션 독립성 검증은 {@code TaxInvoiceEmitAuditRecorder} bean 분리
 * 후 별도 케이스로 추가 예정 (SP-09-1 BE 후속 fix 트래킹).
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class TaxInvoiceEmitNtsIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private AccountingAuditLogRepository auditLogRepository;

    /** 외부 client 격리 — 기존 SlipServiceClient. */
    @MockBean private SlipServiceClient slipServiceClient;

    /** 신규 e-Tax client 격리 — SP-09-1. */
    @MockBean private ETaxClient eTaxClient;
    /** SP-09-4 KFTC 오픈뱅킹 client 격리 — Phase 11 sandbox 전환 시 IT 실 API 호출 방지. */
    @MockBean private KftcClient kftcClient;
    /**
     * SP-D1 동적 권한 client 격리 — auth-service 호출 차단.
     * 기본 lenient stub: canView/canEdit 모두 true (기존 테스트 8건 영향 없음).
     */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    // ─── 1. DRY_RUN 정상 발행 ───────────────────────────────────────────────

    @Test
    @DisplayName("emit-nts DRY_RUN — ISSUED 세금계산서 200 + eTaxExternalId 저장")
    void testEmitNtsDryRunSuccess() throws Exception {
        lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0);
        // SP-D1 동적 권한 stub: ACCOUNTANT 역할로 emit-nts 허용 (canView=true, canEdit=true)
        lenient().when(dynamicPermissionClient.canView(any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(any(), any())).thenReturn(true);
        when(eTaxClient.submit(any(TaxInvoice.class), any()))
                .thenReturn(ETaxSubmitResult.success("DRY-2026/05/18-1-999", "DRY_RUN"));

        String id = createAndIssueDraft();

        Map<String, Object> emitBody = Map.of("submitMethod", "DRY_RUN");

        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emitBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ISSUED"))
                .andExpect(jsonPath("$.data.eTaxExternalId").value("DRY-2026/05/18-1-999"))
                .andExpect(jsonPath("$.data.submitMethod").value("DRY_RUN"))
                .andExpect(jsonPath("$.data.submittedAt").exists())
                .andExpect(jsonPath("$.data.taxInvoiceNo").exists());
    }

    // ─── 2. SALES 역할 금지 ─────────────────────────────────────────────────

    @Test
    @DisplayName("emit-nts — SALES 역할 → 403 FORBIDDEN")
    void testEmitNtsForbiddenForSales() throws Exception {
        lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0);
        lenient().when(dynamicPermissionClient.canView(any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(any(), any())).thenReturn(true);

        String id = createAndIssueDraft();

        Map<String, Object> emitBody = Map.of("submitMethod", "DRY_RUN");

        denyRequirePermission("accounting.tax-invoice.emit-nts", PermissionAction.UPDATE);
        denyDynamicPermissionFor("SALES");
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000102")
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
        lenient().when(dynamicPermissionClient.canView(any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(any(), any())).thenReturn(true);

        String id = createAndIssueDraft();

        Map<String, Object> emitBody = Map.of("submitMethod", "DRY_RUN");

        denyRequirePermission("accounting.tax-invoice.emit-nts", PermissionAction.UPDATE);
        denyDynamicPermissionFor("MANAGER");
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000103")
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
        lenient().when(dynamicPermissionClient.canView(any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(any(), any())).thenReturn(true);

        // DRAFT 상태 그대로 (issue 안 함)
        String id = createDraft();

        Map<String, Object> emitBody = Map.of("submitMethod", "DRY_RUN");

        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
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
        lenient().when(dynamicPermissionClient.canView(any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(any(), any())).thenReturn(true);

        String id = createAndIssueDraft();

        // 취소
        Map<String, Object> cancelBody = Map.of("reason", "테스트 취소 사유 (5자 이상)");
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/cancel")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cancelBody)))
                .andExpect(status().isOk());

        // CANCELLED 상태 emit-nts → 422
        Map<String, Object> emitBody = Map.of("submitMethod", "DRY_RUN");
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
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
        lenient().when(dynamicPermissionClient.canView(any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(any(), any())).thenReturn(true);
        when(eTaxClient.submit(any(TaxInvoice.class), any()))
                .thenReturn(ETaxSubmitResult.success("DRY-2026/05/18-1-111", "DRY_RUN"));

        String id = createAndIssueDraft();
        Map<String, Object> emitBody = Map.of("submitMethod", "DRY_RUN");

        // 최초 발행 성공
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emitBody)))
                .andExpect(status().isOk());

        // 중복 발행 → 409
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emitBody)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TAX_INVOICE_ALREADY_EMITTED"));
    }

    // ─── 7. audit log 기록 확인 ───────────────────────────────────────────

    @Test
    @DisplayName("emit-nts 성공 후 audit revision 기록 확인 — TAX_INVOICE_EMIT_NTS (repository 직접 검증)")
    void testEmitAuditLogRecorded() throws Exception {
        lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0);
        lenient().when(dynamicPermissionClient.canView(any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(any(), any())).thenReturn(true);
        when(eTaxClient.submit(any(TaxInvoice.class), any()))
                .thenReturn(ETaxSubmitResult.success("DRY-AUDIT-20260518", "DRY_RUN"));

        String id = createAndIssueDraft();
        Map<String, Object> emitBody = Map.of("submitMethod", "DRY_RUN");

        // emit-nts 성공
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000110")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(emitBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.eTaxExternalId").value("DRY-AUDIT-20260518"))
                .andExpect(jsonPath("$.data.submitMethod").value("DRY_RUN"));

        // audit log repository 직접 검증 — TAX_INVOICE_EMIT_NTS action 확인.
        // 현재 recordEmitAudit 는 self-invocation 으로 동일 트랜잭션에서 실행되므로
        // @Transactional 테스트 내에서 flush 후 조회 가능 (롤백 시 함께 롤백됨).
        // 트랜잭션 독립성(audit 실패가 markEmitted 에 영향 없음)은 bean 분리 후 검증 예정.
        UUID entityId = UUID.fromString(id);
        List<AccountingAuditLog> auditLogs =
                auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(entityId);

        assertThat(auditLogs)
                .as("emit-nts 후 audit row 가 1건 이상 존재해야 한다")
                .isNotEmpty();

        boolean hasEmitNtsAction = auditLogs.stream()
                .anyMatch(log -> "action".equals(log.getFieldName())
                        && "TAX_INVOICE_EMIT_NTS".equals(log.getNewValue()));
        assertThat(hasEmitNtsAction)
                .as("TAX_INVOICE_EMIT_NTS action audit row 가 존재해야 한다")
                .isTrue();

        boolean hasETaxExternalId = auditLogs.stream()
                .anyMatch(log -> "eTaxExternalId".equals(log.getFieldName())
                        && "DRY-AUDIT-20260518".equals(log.getNewValue()));
        assertThat(hasETaxExternalId)
                .as("eTaxExternalId=DRY-AUDIT-20260518 audit row 가 존재해야 한다")
                .isTrue();

        // 동일 세금계산서 재발행 시도 → 409 (eTaxExternalId 설정 확인)
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000110")
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
        lenient().when(dynamicPermissionClient.canView(any(), any())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(any(), any())).thenReturn(true);
        when(eTaxClient.submit(any(TaxInvoice.class), any()))
                .thenThrow(new BusinessException(ErrorCode.ETAX_SUBMIT_FAILED,
                        "NTS API 타임아웃"));

        String id = createAndIssueDraft();
        Map<String, Object> emitBody = Map.of("submitMethod", "NTS");

        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
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
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
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
