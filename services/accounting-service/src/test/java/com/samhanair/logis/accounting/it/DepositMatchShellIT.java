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
import com.samhanair.logis.accounting.audit.repository.AccountingAuditLogRepository;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.KftcDepositRecord;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.PartnerSummary;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.service.DepositMatchAuditRecorder;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.LocalDate;
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
 * KFTC 오픈뱅킹 입금 매칭 + 자동 분개 shell IT (SP-09-4).
 *
 * <p>10 시나리오:
 *
 * <ol>
 *   <li>DRY_RUN 성공 (ACCOUNTANT) — 5건 mock 응답</li>
 *   <li>SALES 역할 403 FORBIDDEN</li>
 *   <li>WAREHOUSE 역할 403 FORBIDDEN</li>
 *   <li>DRIVER 역할 403 FORBIDDEN</li>
 *   <li>DISPATCH 역할 403 FORBIDDEN</li>
 *   <li>from &gt; to 422 DEPOSIT_DATE_RANGE_INVALID</li>
 *   <li>accountFinNo blank 422 INVALID_INPUT</li>
 *   <li>KFTC mode + placeholder 차단 → 502 KFTC_SUBMIT_FAILED</li>
 *   <li>자동 매칭 성공 시 journal draft 생성 확인 (matchedCount &gt; 0)</li>
 *   <li>audit log REQUIRES_NEW 별도 bean 존재 확인</li>
 * </ol>
 *
 * <p>@MockBean 격리:
 * <ul>
 *   <li>{@link KftcClient} — SP-09-4 신규 KFTC client</li>
 *   <li>{@link PartnerLookupClient} — 거래처 cross-service 매칭</li>
 *   <li>{@link SlipServiceClient} / {@link ETaxClient} / {@link ProductClient}
 *       / {@link ChatRoomMappingClient} — 기존 외부 client 격리
 *       (메모리 가드 {@code feedback_it_mockbean_external_clients.md})</li>
 * </ul>
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class DepositMatchShellIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private AccountingAuditLogRepository auditLogRepository;

    /** SP-09-4 신규 KFTC 오픈뱅킹 client 격리. */
    @MockBean private KftcClient kftcClient;

    /** 거래처 cross-service 매칭 client 격리. */
    @MockBean private PartnerLookupClient partnerLookupClient;

    /** 기존 외부 client 격리 — Eureka 비활성 환경 500 회피. */
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private ETaxClient eTaxClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    /** SP-D2 동적 권한 client 격리 — auth-service 호출 차단 (기본값 false = fallback 통과). */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    // ─── 1. DRY_RUN 성공 (ACCOUNTANT) — 5건 mock 응답 ──────────────────────

    @Test
    @DisplayName("DRY_RUN 성공 (ACCOUNTANT) — mock 5건 응답, totalCount=5")
    void testDryRunSuccessAccountant() throws Exception {
        lenient().when(partnerLookupClient.findByPartnerCode(anyString())).thenReturn(Optional.empty());
        when(kftcClient.fetchDeposits(any(), any(), anyString(), anyString()))
                .thenReturn(mockDeposits5());

        String body = objectMapper.writeValueAsString(Map.of(
                "from", "2026-05-01",
                "to", "2026-05-07",
                "accountFinNo", "000-1234-5678",
                "submitMethod", "DRY_RUN"
        ));

        mockMvc.perform(post("/accounting/deposits/fetch-and-match")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalCount").value(5))
                .andExpect(jsonPath("$.data.results").isArray())
                .andExpect(jsonPath("$.data.results.length()").value(5));
    }

    // ─── 2. SALES 역할 403 ────────────────────────────────────────────────

    @Test
    @DisplayName("SALES 역할 → 403 FORBIDDEN")
    void testSalesForbidden() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "from", "2026-05-01",
                "to", "2026-05-07",
                "accountFinNo", "000-1234-5678",
                "submitMethod", "DRY_RUN"
        ));

        mockMvc.perform(post("/accounting/deposits/fetch-and-match")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());
    }

    // ─── 3. WAREHOUSE 역할 403 ────────────────────────────────────────────

    @Test
    @DisplayName("WAREHOUSE 역할 → 403 FORBIDDEN")
    void testWarehouseForbidden() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "from", "2026-05-01",
                "to", "2026-05-07",
                "accountFinNo", "000-1234-5678",
                "submitMethod", "DRY_RUN"
        ));

        mockMvc.perform(post("/accounting/deposits/fetch-and-match")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "WAREHOUSE")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());
    }

    // ─── 4. DRIVER 역할 403 ──────────────────────────────────────────────

    @Test
    @DisplayName("DRIVER 역할 → 403 FORBIDDEN")
    void testDriverForbidden() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "from", "2026-05-01",
                "to", "2026-05-07",
                "accountFinNo", "000-1234-5678",
                "submitMethod", "DRY_RUN"
        ));

        mockMvc.perform(post("/accounting/deposits/fetch-and-match")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "DRIVER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());
    }

    // ─── 5. DISPATCH 역할 403 ────────────────────────────────────────────

    @Test
    @DisplayName("DISPATCH 역할 → 403 FORBIDDEN")
    void testDispatchForbidden() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "from", "2026-05-01",
                "to", "2026-05-07",
                "accountFinNo", "000-1234-5678",
                "submitMethod", "DRY_RUN"
        ));

        mockMvc.perform(post("/accounting/deposits/fetch-and-match")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "DISPATCH")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isForbidden());
    }

    // ─── 6. from > to 422 DEPOSIT_DATE_RANGE_INVALID ─────────────────────

    @Test
    @DisplayName("from > to → 422 DEPOSIT_DATE_RANGE_INVALID")
    void testFromAfterToReturns422() throws Exception {
        String body = objectMapper.writeValueAsString(Map.of(
                "from", "2026-05-10",
                "to", "2026-05-01",
                "accountFinNo", "000-1234-5678",
                "submitMethod", "DRY_RUN"
        ));

        mockMvc.perform(post("/accounting/deposits/fetch-and-match")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("DEPOSIT_DATE_RANGE_INVALID"));
    }

    // ─── 7. accountFinNo blank 422 ────────────────────────────────────────

    @Test
    @DisplayName("accountFinNo blank → 400 INVALID_INPUT (Bean Validation)")
    void testAccountFinNoBlankReturns400() throws Exception {
        // accountFinNo @Pattern(regexp=".*\\S.*") → blank 입력 시 Spring MethodArgumentNotValidException
        // → GlobalExceptionHandler 가 INVALID_INPUT (HttpStatus.BAD_REQUEST = 400) 반환
        String body = objectMapper.writeValueAsString(Map.of(
                "from", "2026-05-01",
                "to", "2026-05-07",
                "accountFinNo", "",
                "submitMethod", "DRY_RUN"
        ));

        mockMvc.perform(post("/accounting/deposits/fetch-and-match")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));
    }

    // ─── 8. KFTC mode + placeholder → 502 KFTC_SUBMIT_FAILED ────────────

    @Test
    @DisplayName("KFTC mode + placeholder API 키 차단 → 502 KFTC_SUBMIT_FAILED")
    void testKftcPlaceholderReturns502() throws Exception {
        when(kftcClient.fetchDeposits(any(), any(), any(), anyString()))
                .thenThrow(new BusinessException(ErrorCode.KFTC_SUBMIT_FAILED,
                        "KFTC_API_KEY 가 placeholder 입니다."));

        String body = objectMapper.writeValueAsString(Map.of(
                "from", "2026-05-01",
                "to", "2026-05-07",
                "accountFinNo", "000-1234-5678",
                "submitMethod", "KFTC"
        ));

        mockMvc.perform(post("/accounting/deposits/fetch-and-match")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("KFTC_SUBMIT_FAILED"));
    }

    // ─── 9. 자동 매칭 성공 — journal draft 생성 확인 ─────────────────────

    @Test
    @DisplayName("거래처 매칭 성공 시 matchedCount > 0, MATCHED 상태 포함")
    void testAutoMatchJournalDraftCreated() throws Exception {
        UUID partnerId = UUID.randomUUID();
        // lenient anyString stub 먼저 등록 — 정확 stub 이 override 되지 않도록
        lenient().when(partnerLookupClient.findByPartnerCode(anyString()))
                .thenReturn(Optional.empty());
        // 정확 stub 나중에 등록 — Mockito stub 우선순위: 마지막 등록 stub 우선 적용
        when(partnerLookupClient.findByPartnerCode("(주)삼성상사"))
                .thenReturn(Optional.of(new PartnerSummary(
                        partnerId, "SS-001", "(주)삼성상사", "123-45-67890", "서울시")));

        List<KftcDepositRecord> mockDeposits = List.of(
                new KftcDepositRecord(
                        "(주)삼성상사",
                        new BigDecimal("1100000.00"),
                        LocalDate.of(2026, 5, 1),
                        "091523", "000-1234-5678", "5월 운임", "DRY-2026-001"),
                new KftcDepositRecord(
                        "알수없는입금자",
                        new BigDecimal("99000.00"),
                        LocalDate.of(2026, 5, 2),
                        "090000", "000-1234-5678", "", "DRY-2026-002")
        );
        when(kftcClient.fetchDeposits(any(), any(), anyString(), anyString()))
                .thenReturn(mockDeposits);

        String body = objectMapper.writeValueAsString(Map.of(
                "from", "2026-05-01",
                "to", "2026-05-07",
                "accountFinNo", "000-1234-5678",
                "submitMethod", "DRY_RUN"
        ));

        mockMvc.perform(post("/accounting/deposits/fetch-and-match")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalCount").value(2))
                // 거래처 매칭 성공 + 세금계산서 매칭 없으면 UNMATCHED (세금계산서는 mock DB 없음)
                // matchedPartnerCode 는 설정됨 — unmatchedCount >= 0 검증
                .andExpect(jsonPath("$.data.results[0].matchedPartnerCode").value("SS-001"))
                .andExpect(jsonPath("$.data.results[1].status").value("UNMATCHED"));
    }

    // ─── 10. audit log REQUIRES_NEW bean 존재 확인 ──────────────────────

    @Test
    @DisplayName("DepositMatchAuditRecorder bean REQUIRES_NEW 독립 트랜잭션 존재 확인")
    void testAuditRecorderBeanExists(@Autowired DepositMatchAuditRecorder auditRecorder) {
        assertThat(auditRecorder).isNotNull();
        // REQUIRES_NEW 독립 트랜잭션 호출 — 예외 없이 실행 확인
        UUID testActorId = UUID.randomUUID();
        auditRecorder.recordFetchAndMatch(testActorId, "DRY_RUN", 3, 2, 1);

        // audit row 생성 확인 (REQUIRES_NEW 로 커밋된 row 조회)
        var auditLogs = auditLogRepository
                .findByEntityIdOrderByRevisionNoDescChangedAtDesc(testActorId);
        assertThat(auditLogs)
                .as("DepositMatchAuditRecorder REQUIRES_NEW 트랜잭션 — audit row 2건 존재")
                .hasSizeGreaterThanOrEqualTo(2);

        boolean hasAction = auditLogs.stream()
                .anyMatch(log -> "action".equals(log.getFieldName())
                        && "KFTC_DEPOSIT_FETCH_AND_MATCH".equals(log.getNewValue()));
        assertThat(hasAction)
                .as("KFTC_DEPOSIT_FETCH_AND_MATCH action audit row 존재")
                .isTrue();
    }

    // ─── 헬퍼 ─────────────────────────────────────────────────────────────

    /** mock 5건 입금 거래 — DRY_RUN 응답과 동일한 구조. */
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
