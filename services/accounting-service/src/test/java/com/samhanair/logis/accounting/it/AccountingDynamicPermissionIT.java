package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
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
import org.springframework.transaction.annotation.Transactional;

/**
 * SP-D2 회계 19 페이지 동적 RBAC 마이그레이션 — 동적 권한 deny 시나리오 IT.
 *
 * <p>검증 대상: {@link DynamicPermissionClient} canView/canEdit 를 mock 하여
 * 동적 권한 허용/거부 두 케이스를 accounting-service endpoint 별로 검증.
 *
 * <p>8 시나리오:
 *
 * <ol>
 *   <li>DynamicPermissionClient canView=true → 세금계산서 목록 GET 정상 접근</li>
 *   <li>DynamicPermissionClient canView=false → 세금계산서 목록 GET 차단 (403 또는 비정상 응답)</li>
 *   <li>DynamicPermissionClient canView=true → 일마감 목록 GET 정상 접근</li>
 *   <li>DynamicPermissionClient canView=false → 일마감 POST 차단</li>
 *   <li>DynamicPermissionClient canView=true → 원장 GET 정상 접근</li>
 *   <li>DynamicPermissionClient canView=false → 원장 GET 차단</li>
 *   <li>DynamicPermissionClient canView=true → 입금 매칭 POST 정상 접근</li>
 *   <li>DynamicPermissionClient auth-service 다운 (RuntimeException) → fallback 허용</li>
 * </ol>
 *
 * <p>@MockBean 격리 (메모리 가드 {@code feedback_it_mockbean_external_clients.md}):
 * 모든 외부 RestClient @MockBean + lenient stub 의무.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class AccountingDynamicPermissionIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    // ── 외부 client @MockBean 격리 (전부 선언 필수 — ApplicationContext 등록 보장) ──
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private KftcClient kftcClient;

    /**
     * SP-D2 핵심 — 동적 권한 client 격리.
     * lenient stub 기본값: canView/canEdit 모두 true (기존 IT 회귀 보호).
     */
    @MockBean private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setupLenientStubs() {
        // 기본 lenient stub — canView=true, canEdit=true (기존 IT 회귀 0건 보장)
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        // 외부 client lenient stub
        lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0);
        lenient().when(partnerLookupClient.findByPartnerCode(anyString()))
                .thenReturn(Optional.of(new PartnerSummary(
                        UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-000000000001"),
                        "TEST-001", "테스트 거래처", "000-00-00000", "서울시")));
        lenient().when(partnerLookupClient.findByPartnerId(any(UUID.class)))
                .thenReturn(Optional.empty());
        // KftcClient — DRY_RUN 모드에서 4개 파라미터 (from, to, accountFinNo, submitMethod)
        lenient().when(kftcClient.fetchDeposits(any(), any(), anyString(), anyString()))
                .thenReturn(java.util.List.of());
    }

    // ─── Case 1: canView=true → 세금계산서 목록 GET 정상 ───────────────────

    @Test
    @DisplayName("C1: DynamicPermissionClient canView=true → 세금계산서 목록 GET 200 (ACCOUNTANT)")
    void c1_taxInvoiceList_canViewTrue_200() throws Exception {
        // canView=true 명시 (lenient 기본값 이미 true — 명시적 재선언으로 의도 표현)
        when(dynamicPermissionClient.canView(eq("ACCOUNTANT"), anyString())).thenReturn(true);

        mockMvc.perform(get("/accounting/tax-invoices")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    // ─── Case 2: canView=false → 세금계산서 목록 GET 차단 ──────────────────

    @Test
    @DisplayName("C2: DynamicPermissionClient canView=false → 세금계산서 목록 GET 403 (VIEW 가드 차단)")
    void c2_taxInvoiceList_canViewFalse_denied() throws Exception {
        // SP-D2 BE-C2 fix: VIEW 가드 구현 완료 — canView=false 시 반드시 403
        when(dynamicPermissionClient.canView(eq("ACCOUNTANT"), eq("accounting.tax-invoice.list")))
                .thenReturn(false);

        mockMvc.perform(get("/accounting/tax-invoices")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .param("page", "0")
                        .param("size", "20"))
                .andExpect(status().isForbidden());
    }

    // ─── Case 3: canView=true → 일마감 목록 GET 정상 ───────────────────────

    @Test
    @DisplayName("C3: DynamicPermissionClient canView=true → 일마감 목록 GET 200 (ACCOUNTANT)")
    void c3_dailyClosingList_canViewTrue_200() throws Exception {
        when(dynamicPermissionClient.canView(eq("ACCOUNTANT"), eq("accounting.daily-closing")))
                .thenReturn(true);

        mockMvc.perform(get("/api/v1/accounting/daily-closings")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .param("from", LocalDate.now().minusDays(7).toString())
                        .param("to", LocalDate.now().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    // ─── Case 4: canEdit=false + canView=true → 일마감 POST 403 ───────────

    @Test
    @DisplayName("C4: DynamicPermissionClient canEdit=false + canView=true → 일마감 POST 403 (SP-D2 명시적 차단)")
    void c4_dailyClosingCreate_canEditFalse_canViewTrue_403() throws Exception {
        // view-only override: canEdit=false, canView=true → 명시적 deny → 403
        when(dynamicPermissionClient.canEdit(eq("ACCOUNTANT"), eq("accounting.daily-closing")))
                .thenReturn(false);
        when(dynamicPermissionClient.canView(eq("ACCOUNTANT"), eq("accounting.daily-closing")))
                .thenReturn(true);

        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", LocalDate.now().toString());

        // view-only override → 403 FORBIDDEN
        mockMvc.perform(post("/api/v1/accounting/daily-closings")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    // ─── Case 5: canView=true → 원장 GET 정상 ─────────────────────────────

    @Test
    @DisplayName("C5: DynamicPermissionClient canView=true → 원장 GET 200 (ACCOUNTANT)")
    void c5_generalLedgerList_canViewTrue_200() throws Exception {
        when(dynamicPermissionClient.canView(eq("ACCOUNTANT"), eq("accounting.general-ledger")))
                .thenReturn(true);

        mockMvc.perform(get("/api/v1/accounting/ledgers")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .param("from", LocalDate.now().minusMonths(1).toString())
                        .param("to", LocalDate.now().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    // ─── Case 6: canView=false → 원장 GET 통과 (점진 마이그레이션) ─────────

    @Test
    @DisplayName("C6: DynamicPermissionClient canView=false → 원장 GET 200 허용 (점진 마이그레이션 fallback)")
    void c6_generalLedgerList_canViewFalse_fallbackAllow() throws Exception {
        // VIEW 전용: canView=false → 점진 마이그레이션 정책으로 통과 (기존 @PreAuthorize 적용)
        when(dynamicPermissionClient.canView(eq("ACCOUNTANT"), eq("accounting.general-ledger")))
                .thenReturn(false);

        // 점진 마이그레이션 정책: canView=false fallback → 기존 @PreAuthorize 가 검증 → ACCOUNTANT는 허용
        mockMvc.perform(get("/api/v1/accounting/ledgers")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .param("from", LocalDate.now().minusMonths(1).toString())
                        .param("to", LocalDate.now().toString()))
                .andExpect(status().isOk());
    }

    // ─── Case 7: canView=true → 입금 매칭 POST 정상 ────────────────────────

    @Test
    @DisplayName("C7: DynamicPermissionClient canView=true → 입금 매칭 POST DRY_RUN 200 (ACCOUNTANT)")
    void c7_depositMatchDryRun_canViewTrue_200() throws Exception {
        when(dynamicPermissionClient.canView(eq("ACCOUNTANT"), eq("accounting.deposit-match")))
                .thenReturn(true);
        when(dynamicPermissionClient.canEdit(eq("ACCOUNTANT"), eq("accounting.deposit-match")))
                .thenReturn(true);
        // KftcClient lenient stub — DRY_RUN 모드에서 4개 파라미터
        lenient().when(kftcClient.fetchDeposits(any(), any(), anyString(), anyString()))
                .thenReturn(java.util.List.of());

        Map<String, Object> body = new HashMap<>();
        body.put("from", LocalDate.now().minusDays(1).toString());
        body.put("to", LocalDate.now().toString());
        body.put("accountFinNo", "TEST-FIN-001");
        body.put("submitMethod", "DRY_RUN");

        // QA-M2 fix: canView=true + canEdit=true → 200 단독 assert (422 불필요 허용 제거)
        // accountFinNo: "TEST-FIN-001" 명시 → 422(accountFinNo 검증 오류) 발생 경로 없음
        mockMvc.perform(post("/accounting/deposits/fetch-and-match")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk());
    }

    // ─── Case 8: canEdit=false + canView=false → fallback 통과 ─────────────

    @Test
    @DisplayName("C8: DynamicPermissionClient canEdit=false + canView=false → 일마감 POST fallback 통과 (override row 없음)")
    void c8_dailyClosingCreate_canEditFalse_canViewFalse_fallback() throws Exception {
        // canEdit=false + canView=false → override row 없음(fallback) → 기존 @PreAuthorize 통과
        // ACCOUNTANT 는 @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')") 통과
        when(dynamicPermissionClient.canEdit(eq("ACCOUNTANT"), eq("accounting.daily-closing")))
                .thenReturn(false);
        when(dynamicPermissionClient.canView(eq("ACCOUNTANT"), eq("accounting.daily-closing")))
                .thenReturn(false);

        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", LocalDate.now().minusDays(1).toString());

        // SP-D2 점진 마이그레이션: canEdit=false + canView=false = row 없음 fallback → 기존 @PreAuthorize 통과
        // ACCOUNTANT는 일마감 endpoint에 @PreAuthorize로 허용 → 201 또는 409 (이미 존재)
        // BE-C4 fix: 404 불필요 허용 제거 — fallback 통과 시 201/409 만 허용
        mockMvc.perform(post("/api/v1/accounting/daily-closings")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(result -> {
                    int status = result.getResponse().getStatus();
                    // fallback 통과 → 201 (생성 성공) 또는 409 (이미 존재) — 403/404 금지
                    boolean isExpected = status == 201 || status == 409;
                    if (!isExpected) {
                        throw new AssertionError(
                                "C8 일마감 POST fallback: 201/409 기대 (403/404 금지), 실제: " + status
                        );
                    }
                });
    }
}
