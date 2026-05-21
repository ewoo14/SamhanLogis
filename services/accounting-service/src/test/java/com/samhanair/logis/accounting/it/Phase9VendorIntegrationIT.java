package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.ETaxSubmitResult;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.KftcDepositRecord;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
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
 * Phase 9 vendor 통합 검증 IT (SP-09-5).
 *
 * <p>accounting-service 내 2 vendor client (ETaxClient / KftcClient) 의
 * 일관 패턴을 cross-check 하는 회귀 가드 테스트.
 *
 * <p>검증 항목:
 *
 * <ol>
 *   <li>NTS + KFTC 동시 DRY_RUN 성공 — ACCOUNTANT 권한으로 두 endpoint 모두 정상 응답</li>
 *   <li>NTS DRY_RUN → eTaxExternalId "DRY-" 접두어 형식 일관 확인</li>
 *   <li>KFTC DRY_RUN → totalCount = 5 mock 응답 형식 일관 확인</li>
 *   <li>NTS placeholder → 502 ETAX_SUBMIT_FAILED 에러 코드 일관</li>
 *   <li>KFTC placeholder → 502 KFTC_SUBMIT_FAILED 에러 코드 일관</li>
 *   <li>4 vendor 권한 매트릭스 — SALES 가 NTS endpoint 403 (emit-nts PreAuthorize 재확인)</li>
 *   <li>4 vendor 권한 매트릭스 — SALES 가 KFTC endpoint 403 (fetch-and-match PreAuthorize 재확인)</li>
 *   <li>NTS + KFTC 모든 @MockBean 등록 확인 — 동일 SpringBootTest 에서 격리 동작</li>
 * </ol>
 *
 * <p>@MockBean 격리:
 * <ul>
 *   <li>{@link ETaxClient} — SP-09-1 NTS e-tax client</li>
 *   <li>{@link KftcClient} — SP-09-4 KFTC 오픈뱅킹 client</li>
 *   <li>{@link PartnerLookupClient} — KFTC 거래처 매칭 client</li>
 *   <li>{@link SlipServiceClient} / {@link ProductClient} / {@link ChatRoomMappingClient}
 *       — 기존 외부 client 격리 (메모리 가드 {@code feedback_it_mockbean_external_clients.md})</li>
 * </ul>
 *
 * <p>NOTE: Aligo (SP-09-2) 와 Clova OCR (SP-09-3) 은 별도 서비스
 * (notification-service / slip-service) 에 속하므로 각 서비스의 IT
 * ({@code AligoSmsAdapterSendAuditIT} / {@code ReceiptOcrShellIT}) 에서 검증됨.
 * 본 IT 는 accounting-service 내 NTS + KFTC 패턴 일관성에 집중.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class Phase9VendorIntegrationIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    /** NTS e-Tax client 격리 — SP-09-1. */
    @MockBean private ETaxClient eTaxClient;

    /** KFTC 오픈뱅킹 client 격리 — SP-09-4. */
    @MockBean private KftcClient kftcClient;
    /** SP-D2 동적 권한 client 격리 — auth-service 호출 차단 (기본값 false = fallback 통과). */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    /** KFTC 거래처 매칭 cross-service client 격리. */
    @MockBean private PartnerLookupClient partnerLookupClient;

    /** 기존 외부 client 격리 — Eureka 비활성 환경 보호. */
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;

    // ─── 1. NTS + KFTC 동시 DRY_RUN 성공 ─────────────────────────────────

    /**
     * Case 1: NTS DRY_RUN + KFTC DRY_RUN 을 동일 SpringBootTest 컨텍스트에서 순차 호출.
     *
     * <p>두 vendor client 가 모두 @MockBean 으로 격리되어 있는지, 그리고
     * 두 endpoint 모두 ACCOUNTANT 권한으로 200 응답을 반환하는지 검증한다.
     * 이 케이스가 실패하면 두 @MockBean 중 하나가 누락되었거나 bean 충돌이 발생한 것.
     */
    @Test
    @DisplayName("Case 1: NTS + KFTC 동시 DRY_RUN 성공 — 동일 SpringBootTest 컨텍스트 격리 확인")
    void testNtsAndKftcDryRunBothSucceed() throws Exception {
        // NTS DRY_RUN stub
        lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0);
        when(eTaxClient.submit(any(TaxInvoice.class), any()))
                .thenReturn(ETaxSubmitResult.success("DRY-INTEGRATION-TEST-001", "DRY_RUN"));

        // KFTC DRY_RUN stub
        lenient().when(partnerLookupClient.findByPartnerCode(anyString()))
                .thenReturn(Optional.empty());
        when(kftcClient.fetchDeposits(any(), any(), anyString(), anyString()))
                .thenReturn(mockDeposits5());

        // ── NTS emit-nts 호출
        String taxInvoiceId = createAndIssueTaxInvoice();
        mockMvc.perform(post("/accounting/tax-invoices/" + taxInvoiceId + "/emit-nts")
                        .header("X-User-Id", "accountant-integration")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("submitMethod", "DRY_RUN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.eTaxExternalId").value("DRY-INTEGRATION-TEST-001"))
                .andExpect(jsonPath("$.data.submitMethod").value("DRY_RUN"));

        // ── KFTC fetch-and-match 호출
        mockMvc.perform(post("/accounting/deposits/fetch-and-match")
                        .header("X-User-Id", "accountant-integration")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "from", "2026-05-01",
                                "to", "2026-05-07",
                                "accountFinNo", "000-1234-5678",
                                "submitMethod", "DRY_RUN"
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalCount").value(5));
    }

    // ─── 2. NTS DRY_RUN — eTaxExternalId "DRY-" 형식 일관 ────────────────

    /**
     * Case 2: NTS DRY_RUN 성공 시 eTaxExternalId 가 "DRY-" 접두어를 포함하는지 검증.
     *
     * <p>패턴: "DRY-{taxInvoiceNo}-{epochMilli}" — ETaxClientImpl DRY_RUN 구현 계약.
     * 이 형식이 변경되면 SP-09-1 FE 계약 (TaxInvoiceDetailPage) 도 함께 변경해야 함.
     */
    @Test
    @DisplayName("Case 2: NTS DRY_RUN — eTaxExternalId 'DRY-' 접두어 형식 일관")
    void testNtsDryRunExternalIdFormat() throws Exception {
        lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0);
        when(eTaxClient.submit(any(TaxInvoice.class), any()))
                .thenReturn(ETaxSubmitResult.success("DRY-20260518-0099-1747555200000", "DRY_RUN"));

        String id = createAndIssueTaxInvoice();
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "accountant-pattern")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("submitMethod", "DRY_RUN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.eTaxExternalId").value("DRY-20260518-0099-1747555200000"))
                .andExpect(jsonPath("$.data.submitMethod").value("DRY_RUN"))
                .andExpect(jsonPath("$.data.submittedAt").exists());
    }

    // ─── 3. KFTC DRY_RUN — totalCount = 5 mock 응답 형식 일관 ─────────────

    /**
     * Case 3: KFTC DRY_RUN 성공 시 totalCount = 5 로 일관된 mock 응답 형식 검증.
     *
     * <p>KftcClientImpl DRY_RUN 구현 계약: mock 5건 즉시 반환.
     * DepositMatchResponse.totalCount = results.size() 로 계산됨.
     */
    @Test
    @DisplayName("Case 3: KFTC DRY_RUN — totalCount=5 mock 응답 형식 일관")
    void testKftcDryRunResponseFormat() throws Exception {
        lenient().when(partnerLookupClient.findByPartnerCode(anyString()))
                .thenReturn(Optional.empty());
        when(kftcClient.fetchDeposits(any(), any(), anyString(), anyString()))
                .thenReturn(mockDeposits5());

        mockMvc.perform(post("/accounting/deposits/fetch-and-match")
                        .header("X-User-Id", "accountant-kftc-pattern")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "from", "2026-05-01",
                                "to", "2026-05-07",
                                "accountFinNo", "DRY-FIN-TEST",
                                "submitMethod", "DRY_RUN"
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalCount").value(5))
                .andExpect(jsonPath("$.data.results").isArray())
                .andExpect(jsonPath("$.data.results.length()").value(5))
                .andExpect(jsonPath("$.data.matchedCount").isNumber())
                .andExpect(jsonPath("$.data.unmatchedCount").isNumber());
    }

    // ─── 4. NTS placeholder → 502 ETAX_SUBMIT_FAILED 에러 코드 일관 ───────

    /**
     * Case 4: NTS mode (실 API) 에서 placeholder 키 차단 시 502 + ETAX_SUBMIT_FAILED 에러 코드 일관.
     *
     * <p>패턴 일관성: 4 vendor 모두 placeholder → 502 BAD_GATEWAY + 각 vendor 에러 코드 반환.
     * NTS: ETAX_SUBMIT_FAILED / Aligo: SEND_FAILED / Clova: OCR_SUBMIT_FAILED / KFTC: KFTC_SUBMIT_FAILED
     */
    @Test
    @DisplayName("Case 4: NTS placeholder 차단 → 502 ETAX_SUBMIT_FAILED (에러 코드 패턴 일관)")
    void testNtsPlaceholderReturns502() throws Exception {
        lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0);
        when(eTaxClient.submit(any(TaxInvoice.class), any()))
                .thenThrow(new BusinessException(ErrorCode.ETAX_SUBMIT_FAILED,
                        "NTS_API_KEY 가 placeholder 입니다. Phase 11 sandbox 연동 전까지 DRY_RUN 모드만 사용 가능합니다."));

        String id = createAndIssueTaxInvoice();
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "accountant-nts-guard")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("submitMethod", "NTS"))))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("ETAX_SUBMIT_FAILED"));
    }

    // ─── 5. KFTC placeholder → 502 KFTC_SUBMIT_FAILED 에러 코드 일관 ───────

    /**
     * Case 5: KFTC mode (실 API) 에서 placeholder 키 차단 시 502 + KFTC_SUBMIT_FAILED 에러 코드 일관.
     *
     * <p>Case 4 (NTS) 와 동일한 502 패턴 — 4 vendor 에러 코드 일관성 cross-check.
     */
    @Test
    @DisplayName("Case 5: KFTC placeholder 차단 → 502 KFTC_SUBMIT_FAILED (에러 코드 패턴 일관)")
    void testKftcPlaceholderReturns502() throws Exception {
        when(kftcClient.fetchDeposits(any(), any(), anyString(), anyString()))
                .thenThrow(new BusinessException(ErrorCode.KFTC_SUBMIT_FAILED,
                        "KFTC_API_KEY 가 placeholder 입니다. Phase 11 sandbox 연동 전까지 DRY_RUN 모드만 사용 가능합니다."));

        mockMvc.perform(post("/accounting/deposits/fetch-and-match")
                        .header("X-User-Id", "accountant-kftc-guard")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "from", "2026-05-01",
                                "to", "2026-05-07",
                                "accountFinNo", "REAL-FIN-001",
                                "submitMethod", "KFTC"
                        ))))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("KFTC_SUBMIT_FAILED"));
    }

    // ─── 6. SALES 가 NTS endpoint 403 ─────────────────────────────────────

    /**
     * Case 6: SALES 역할이 NTS emit-nts 엔드포인트에 접근 시 403 반환.
     *
     * <p>NTS 권한: ACCOUNTANT / MASTER 만. SALES 차단.
     * 이 케이스 실패 = PreAuthorize 설정 누락 또는 변경.
     */
    @Test
    @DisplayName("Case 6: SALES — NTS emit-nts 403 FORBIDDEN (권한 매트릭스 cross-check)")
    void testSalesForbiddenForNts() throws Exception {
        lenient().when(slipServiceClient.lockByPeriod(any(), any())).thenReturn(0);

        String id = createAndIssueTaxInvoice();
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/emit-nts")
                        .header("X-User-Id", "sales-user-integration")
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("submitMethod", "DRY_RUN"))))
                .andExpect(status().isForbidden());
    }

    // ─── 7. SALES 가 KFTC endpoint 403 ────────────────────────────────────

    /**
     * Case 7: SALES 역할이 KFTC fetch-and-match 엔드포인트에 접근 시 403 반환.
     *
     * <p>KFTC 권한: ACCOUNTANT / MANAGER / MASTER. SALES 차단.
     * Case 6 과 함께 SALES 역할의 4 vendor 모두 차단을 cross-check.
     */
    @Test
    @DisplayName("Case 7: SALES — KFTC fetch-and-match 403 FORBIDDEN (권한 매트릭스 cross-check)")
    void testSalesForbiddenForKftc() throws Exception {
        mockMvc.perform(post("/accounting/deposits/fetch-and-match")
                        .header("X-User-Id", "sales-user-kftc")
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "from", "2026-05-01",
                                "to", "2026-05-07",
                                "accountFinNo", "000-1234-5678",
                                "submitMethod", "DRY_RUN"
                        ))))
                .andExpect(status().isForbidden());
    }

    // ─── 8. @MockBean 격리 패턴 일관 확인 ────────────────────────────────

    /**
     * Case 8: ETaxClient + KftcClient + PartnerLookupClient 3개 bean 이 모두
     * @MockBean 으로 주입됐는지 확인.
     *
     * <p>bean null 이면 lenient().when(...) 이 실패하여 IT 전체가 깨짐.
     * 이 케이스는 @MockBean 주입 자체를 명시적으로 검증하는 회귀 가드.
     * (메모리 가드 {@code feedback_it_mockbean_external_clients.md} 준수 검증)
     */
    @Test
    @DisplayName("Case 8: @MockBean 격리 패턴 — ETaxClient + KftcClient + PartnerLookupClient bean 주입 확인")
    void testMockBeanInjectionPattern() {
        assertThat(eTaxClient)
                .as("ETaxClient 가 @MockBean 으로 주입됐어야 함 (SP-09-1 IT 격리 의무)")
                .isNotNull();
        assertThat(kftcClient)
                .as("KftcClient 가 @MockBean 으로 주입됐어야 함 (SP-09-4 IT 격리 의무)")
                .isNotNull();
        assertThat(partnerLookupClient)
                .as("PartnerLookupClient 가 @MockBean 으로 주입됐어야 함 (KFTC 거래처 매칭 격리)")
                .isNotNull();
        assertThat(slipServiceClient)
                .as("SlipServiceClient 가 @MockBean 으로 주입됐어야 함 (기존 외부 client 격리)")
                .isNotNull();

        // DRY_RUN stub 동작 확인 (lenient 호출 자체가 mock 동작 검증)
        // SP-09-5 CI fix: any(TaxInvoice.class) 는 null 인자 매칭 안 됨 → any() 로 변경
        lenient().when(eTaxClient.submit(any(), any()))
                .thenReturn(ETaxSubmitResult.success("DRY-MOCKBEAN-CHECK", "DRY_RUN"));
        lenient().when(kftcClient.fetchDeposits(any(), any(), anyString(), anyString()))
                .thenReturn(List.of());
        lenient().when(partnerLookupClient.findByPartnerCode(anyString()))
                .thenReturn(Optional.empty());

        // stub 호출 후 예외 없음 확인 (mock 동작 정상)
        // null TaxInvoice 전달 — any() 매처가 null 도 매칭함 (any(TaxInvoice.class) 와 차이)
        ETaxSubmitResult result = eTaxClient.submit(null, "DRY_RUN");
        assertThat(result).as("MockBean stub 응답 not null").isNotNull();
        assertThat(result.eTaxExternalId()).isEqualTo("DRY-MOCKBEAN-CHECK");

        List<KftcDepositRecord> deposits = kftcClient.fetchDeposits(
                LocalDate.now(), LocalDate.now(), "test", "DRY_RUN");
        assertThat(deposits).isEmpty();
    }

    // ─── 헬퍼 ─────────────────────────────────────────────────────────────

    /**
     * 세금계산서 DRAFT 생성 + ISSUED 전이 후 id 반환.
     *
     * <p>{@link TaxInvoiceEmitNtsIT} 와 동일한 헬퍼 패턴 유지 (중복 허용 — 클래스 독립성).
     */
    private String createAndIssueTaxInvoice() throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("itemName", "SP-09-5 통합검증 운임");
        line.put("spec", "kg");
        line.put("quantity", new BigDecimal("10"));
        line.put("unitPrice", new BigDecimal("10000"));
        line.put("memo", "통합 검증");

        Map<String, Object> body = new HashMap<>();
        body.put("partnerId", UUID.randomUUID().toString());
        body.put("partnerBusinessNo", "123-45-67890");
        body.put("partnerName", "SP-09-5 통합검증 거래처");
        body.put("partnerAddress", "서울시 강남구");
        body.put("supplyDate", "2026-05-18");
        body.put("description", "SP-09-5 Phase 9 통합 검증");
        body.put("lines", List.of(line));

        var res = mockMvc.perform(post("/accounting/tax-invoices")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();

        String id = objectMapper.readTree(res.getResponse().getContentAsString())
                .get("data").get("id").asText();

        // ISSUED 전이
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/issue")
                        .header("X-User-Id", "accountant-integration")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());

        return id;
    }

    /**
     * KFTC mock 5건 입금 거래 — DRY_RUN 기본 응답 구조와 1:1.
     *
     * <p>{@link DepositMatchShellIT} 와 동일한 데이터셋 유지 (패턴 일관성).
     */
    private List<KftcDepositRecord> mockDeposits5() {
        LocalDate base = LocalDate.of(2026, 5, 1);
        return List.of(
                new KftcDepositRecord("(주)삼성상사",
                        new BigDecimal("1100000.00"), base, "091523", "000-1234-5678",
                        "5월 운임 입금", "DRY-" + base + "-001"),
                new KftcDepositRecord("한국물류(주)",
                        new BigDecimal("550000.00"), base, "101045", "000-1234-5678",
                        "운임 정산", "DRY-" + base + "-002"),
                new KftcDepositRecord("대한유통",
                        new BigDecimal("3300000.00"), base.plusDays(1), "140230", "000-1234-5678",
                        "세금계산서 결제", "DRY-" + base.plusDays(1) + "-001"),
                new KftcDepositRecord("미래운송",
                        new BigDecimal("220000.00"), base.plusDays(1), "153510", "000-1234-5678",
                        "", "DRY-" + base.plusDays(1) + "-002"),
                new KftcDepositRecord("알수없는입금자",
                        new BigDecimal("99000.00"), base.plusDays(2), "090000", "000-1234-5678",
                        "미상 입금", "DRY-" + base.plusDays(2) + "-001")
        );
    }
}
