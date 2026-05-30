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
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import com.samhanair.logis.security.permission.PermissionAction;
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
 *   <li>DynamicPermissionClient canEdit=false → 일마감 POST 차단</li>
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
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    @BeforeEach
    void setupLenientStubs() {
        // 기본 lenient stub — canView=true, canEdit=true (기존 IT 회귀 0건 보장)
        lenient().when(dynamicPermissionClient.canView(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.canEdit(anyString(), anyString())).thenReturn(true);
        lenient().when(dynamicPermissionClient.check(any(UUID.class), anyString(), any(PermissionAction.class)))
                .thenReturn(true);
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
        when(dynamicPermissionClient.check(any(UUID.class), eq("accounting.tax-invoice.list"), eq(PermissionAction.VIEW)))
                .thenReturn(true);

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
        when(dynamicPermissionClient.check(any(UUID.class), eq("accounting.tax-invoice.list"), eq(PermissionAction.VIEW)))
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
        when(dynamicPermissionClient.check(any(UUID.class), eq("accounting.daily-closing"), eq(PermissionAction.VIEW)))
                .thenReturn(true);

        mockMvc.perform(get("/accounting/daily-closings")
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
        when(dynamicPermissionClient.check(any(UUID.class), eq("accounting.daily-closing.run"), eq(PermissionAction.CREATE)))
                .thenReturn(false);

        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", LocalDate.now().toString());

        // view-only override → 403 FORBIDDEN
        mockMvc.perform(post("/accounting/daily-closings")
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
        when(dynamicPermissionClient.check(any(UUID.class), eq("accounting.general-ledger"), eq(PermissionAction.VIEW)))
                .thenReturn(true);

        mockMvc.perform(get("/accounting/ledgers")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .param("from", LocalDate.now().minusMonths(1).toString())
                        .param("to", LocalDate.now().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    // ─── Case 6: canView=false → 원장 GET 차단 ─────────────────────────────

    @Test
    @DisplayName("C6: DynamicPermissionClient canView=false → 원장 GET 403 (VIEW 가드 차단)")
    void c6_generalLedgerList_canViewFalse_denied() throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq("accounting.general-ledger"), eq(PermissionAction.VIEW)))
                .thenReturn(false);

        mockMvc.perform(get("/accounting/ledgers")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .param("from", LocalDate.now().minusMonths(1).toString())
                        .param("to", LocalDate.now().toString()))
                .andExpect(status().isForbidden());
    }

    // ─── Case 7: canView=true → 입금 매칭 POST 정상 ────────────────────────

    @Test
    @DisplayName("C7: DynamicPermissionClient canView=true → 입금 매칭 POST DRY_RUN 200 (ACCOUNTANT)")
    void c7_depositMatchDryRun_canViewTrue_200() throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq("accounting.deposit-match"), eq(PermissionAction.UPDATE)))
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

    // ─── Case 8: canEdit=false → 일마감 POST 차단 ─────────────────────────

    @Test
    @DisplayName("C8: DynamicPermissionClient canEdit=false → 일마감 POST 403 (EDIT 가드 차단)")
    void c8_dailyClosingCreate_canEditFalse_denied() throws Exception {
        when(dynamicPermissionClient.check(any(UUID.class), eq("accounting.daily-closing.run"), eq(PermissionAction.CREATE)))
                .thenReturn(false);

        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", LocalDate.now().minusDays(1).toString());

        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }
}
