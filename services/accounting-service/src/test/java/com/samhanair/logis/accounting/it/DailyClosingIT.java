package com.samhanair.logis.accounting.it;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import com.samhanair.logis.accounting.domain.DailyClosing;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceLine;
import com.samhanair.logis.accounting.domain.TaxInvoiceType;
import com.samhanair.logis.accounting.repository.DailyClosingRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.security.permission.PermissionAction;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * 일마감 + 원장 endpoint IT (SP-08-6-5).
 *
 * <p>12 시나리오:
 * <ol>
 *   <li>일마감 생성 (전체 거래처) → 201 + isLocked=true</li>
 *   <li>동일 날짜 재마감 → 409 CONFLICT</li>
 *   <li>SALES role 일마감 → 403</li>
 *   <li>기간 조회 GET → 200 + 페이지 결과</li>
 *   <li>거래처코드 포함 일마감 → 201 (partner-service stub)</li>
 *   <li>없는 거래처코드 → 404</li>
 *   <li>원장 조회 (전체) → 200</li>
 *   <li>원장 조회 거래처 필터 → 200 (partner-service stub)</li>
 *   <li>soft-delete 후 동일 날짜 재마감 → 201 (partial unique index 통과)</li>
 *   <li>MASTER unlock → 200</li>
 *   <li>ACCOUNTANT unlock → 403</li>
 *   <li>MANAGER unlock → 403</li>
 * </ol>
 *
 * <p>외부 client 전체 {@code @MockBean} 격리 (메모리 가드
 * {@code feedback_it_mockbean_external_clients.md}).
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class DailyClosingIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private DailyClosingRepository dailyClosingRepository;
    @Autowired private TaxInvoiceRepository taxInvoiceRepository;

    // ── 외부 client @MockBean 격리 (전부 선언 필수) ──────────────────────────
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    /** SP-09-1 e-Tax client 격리 — Phase 11 NTS 전환 시 IT 실 API 호출 방지 (D2). */
    @MockBean private ETaxClient eTaxClient;
    /** SP-09-4 KFTC 오픈뱅킹 client 격리 — Phase 11 sandbox 전환 시 IT 실 API 호출 방지. */
    @MockBean private KftcClient kftcClient;
    /**
     * SP-D2 동적 권한 client 격리 — auth-service 호출 차단.
     * 기본 lenient stub: canView/canEdit 모두 true (기존 테스트 영향 없음).
     */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    private static final String ACCOUNTANT_ID = "00000000-0000-0000-0000-000000000101";
    private static final String SALES_ID = "00000000-0000-0000-0000-000000000102";
    private static final String MASTER_ID = "00000000-0000-0000-0000-000000000100";
    private static final String PARTNER_CODE = "PC001";
    private static final UUID PARTNER_UUID = UUID.fromString("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    @BeforeEach
    void stubExternalClients() {
        // SlipServiceClient lenient stub
        Mockito.lenient()
                .when(slipServiceClient.lockByPeriod(any(), any()))
                .thenReturn(0);

        // PartnerLookupClient — 존재하는 거래처 stub
        PartnerSummary stubPartner = new PartnerSummary(
                PARTNER_UUID, PARTNER_CODE, "테스트거래처", "123-45-67890", "서울시");
        Mockito.lenient()
                .when(partnerLookupClient.findByPartnerCode(PARTNER_CODE))
                .thenReturn(Optional.of(stubPartner));
        Mockito.lenient()
                .when(partnerLookupClient.findByPartnerCode("NOTEXIST"))
                .thenReturn(Optional.empty());
        Mockito.lenient()
                .when(partnerLookupClient.findByPartnerId(any(UUID.class)))
                .thenReturn(Optional.empty());
        Mockito.lenient()
                .when(partnerLookupClient.findByPartnerIdsBatch(Mockito.anyList()))
                .thenReturn(Map.of(PARTNER_UUID, stubPartner));

        // ProductClient — lookup 은 UUID 리스트 기반 batch. 본 IT 에서 직접 호출 없음.
        // @MockBean 으로 ApplicationContext 격리만 보장 (lenient stub 불필요).

        // ChatRoomMappingClient lenient stub
        Mockito.lenient()
                .when(chatRoomMappingClient.findChatRoomNamesByPartnerCode(anyString()))
                .thenReturn(java.util.List.of());

        // SP-D2 DynamicPermissionClient lenient stub — auth-service 호출 차단
        // 기본값: canView/canEdit 모두 true (기존 테스트 케이스 영향 없음)
        Mockito.lenient()
                .when(dynamicPermissionClient.canView(anyString(), anyString()))
                .thenReturn(true);
        Mockito.lenient()
                .when(dynamicPermissionClient.canEdit(anyString(), anyString()))
                .thenReturn(true);
    }

    // ── 1. 일마감 생성 (전체 거래처) → 201 ──────────────────────────────────

    @Test
    @DisplayName("일마감 생성 — 전체 거래처 201 + isLocked=true")
    void testCreateDailyClosingForDate() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", "2026-05-10");
        body.put("scopeMode", "ALL");

        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.closingDate").value("2026-05-10"))
                .andExpect(jsonPath("$.data.isLocked").value(true))
                .andExpect(jsonPath("$.data.lockedBy").value(ACCOUNTANT_ID));
    }

    @Test
    @DisplayName("Q5 — 미검증 금액이 있는 실제 마감은 409로 차단하고 사유를 반환한다")
    void testCreateDailyClosingBlocksUnverifiedAmount() throws Exception {
        TaxInvoice invoice = TaxInvoice.create(PARTNER_UUID, PARTNER_CODE, "1234567890",
                "테스트거래처", "서울시", LocalDate.of(2026, 5, 23), "Q5", TaxInvoiceType.SALES);
        invoice.addLine(TaxInvoiceLine.create(invoice, 1, "테스트품목", null, null,
                BigDecimal.ONE, new BigDecimal("100000"), null));
        invoice.issue("2026/05/23-1", ACCOUNTANT_ID);
        taxInvoiceRepository.saveAndFlush(invoice);

        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"closingDate\":\"2026-05-23\",\"scopeMode\":\"ALL\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message")
                        .value("일마감 금액 검증이 완료되지 않았습니다"));
    }

    @Test
    @DisplayName("일마감 — scopeMode 누락은 400으로 차단")
    void testCreateDailyClosingWithoutScopeModeReturns400() throws Exception {
        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"closingDate\":\"2026-05-09\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("일마감 — SELECTED 거래처 미선택은 400으로 차단")
    void testCreateDailyClosingSelectedWithoutPartnerReturns400() throws Exception {
        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"closingDate\":\"2026-05-08\",\"scopeMode\":\"SELECTED\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("일마감 — ALL 거래처에 partnerCode를 함께 보내면 400으로 차단")
    void testCreateDailyClosingAllWithPartnerReturns400() throws Exception {
        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"closingDate\":\"2026-05-07\",\"scopeMode\":\"ALL\",\"partnerCode\":\"PC001\"}"))
                .andExpect(status().isBadRequest());
    }

    // ── 2. 동일 날짜 재마감 → 409 ────────────────────────────────────────────

    @Test
    @DisplayName("일마감 중복 실행 — 409 CONFLICT")
    void testCreateDailyClosingDuplicate() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", "2026-05-11");
        body.put("scopeMode", "ALL");

        // 첫 번째 마감
        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());

        // 동일 날짜 재시도 → 409
        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isConflict());
    }

    // ── 3. SALES role → 403 ──────────────────────────────────────────────────

    @Test
    @DisplayName("일마감 — SALES role 403 Forbidden")
    void testCreateDailyClosingForbiddenForSales() throws Exception {
        denyRequirePermission("accounting.daily-closing.run", PermissionAction.CREATE);
        Mockito.when(dynamicPermissionClient.canEdit("SALES", "accounting.daily-closing.run"))
                .thenReturn(false);

        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", "2026-05-12");
        body.put("scopeMode", "ALL");

        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", SALES_ID)
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    // ── 4. 기간 조회 GET → 200 ───────────────────────────────────────────────

    @Test
    @DisplayName("일마감 기간 조회 GET — 200 페이지 결과")
    void testGetDailyClosingsRange() throws Exception {
        // 마감 1건 생성
        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", "2026-05-13");
        body.put("scopeMode", "ALL");
        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());

        // 기간 조회
        mockMvc.perform(get("/accounting/daily-closings")
                        .param("from", "2026-05-01")
                        .param("to", "2026-05-31")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.totalElements").isNumber());
    }

    // ── 5. 거래처코드 포함 일마감 → 201 ─────────────────────────────────────

    @Test
    @DisplayName("일마감 — 거래처코드 지정 201 (partner-service stub)")
    void testCreateDailyClosingWithPartner() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", "2026-05-14");
        body.put("partnerCode", PARTNER_CODE);
        body.put("scopeMode", "SELECTED");

        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.bizNo").value("1234567890"))
                .andExpect(jsonPath("$.data.partnerCode").value(PARTNER_CODE))
                .andExpect(jsonPath("$.data.isLocked").value(true));
    }

    // ── 6. 없는 거래처코드 → 404 ─────────────────────────────────────────────

    @Test
    @DisplayName("일마감 — 없는 거래처코드 404")
    void testCreateDailyClosingPartnerNotFound() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", "2026-05-15");
        body.put("partnerCode", "NOTEXIST");
        body.put("scopeMode", "SELECTED");

        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isNotFound());
    }

    // ── 7. 원장 조회 (전체 거래처) → 200 ────────────────────────────────────

    @Test
    @DisplayName("원장 조회 전체 거래처 — 200")
    void testGetLedgersAllPartners() throws Exception {
        mockMvc.perform(get("/accounting/ledgers")
                        .param("from", "2026-05-01")
                        .param("to", "2026-05-31")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.periodFrom").value("2026-05-01"))
                .andExpect(jsonPath("$.data.periodTo").value("2026-05-31"))
                .andExpect(jsonPath("$.data.lines").isArray());
    }

    // ── 8. 원장 조회 거래처 필터 → 200 ──────────────────────────────────────

    @Test
    @DisplayName("원장 조회 거래처 필터 — 200 (partner-service stub)")
    void testGetLedgersWithPartnerFilter() throws Exception {
        mockMvc.perform(get("/accounting/ledgers")
                        .param("from", "2026-05-01")
                        .param("to", "2026-05-31")
                        .param("partnerCode", PARTNER_CODE)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.partnerCode").value(PARTNER_CODE))
                .andExpect(jsonPath("$.data.lines").isArray());
    }

    // ── 9. soft-delete 후 동일 날짜 재마감 → 201 ────────────────────────────

    @Test
    @DisplayName("soft-delete 후 동일 날짜 재마감 — partial unique index 통과 201")
    void testReopenAfterSoftDelete() throws Exception {
        // (a) 마감 생성
        Map<String, Object> body = new HashMap<>();
        body.put("closingDate", "2026-05-20");
        body.put("scopeMode", "ALL");
        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());

        // (b) soft-delete — 엔티티 직접 조작 (markDeleted 도메인 메서드)
        DailyClosing dc = dailyClosingRepository
                .findByClosingDateAndPartnerIdIsNull(LocalDate.of(2026, 5, 20))
                .orElseThrow();
        dc.markDeleted(ACCOUNTANT_ID);
        dailyClosingRepository.saveAndFlush(dc);

        // (c) 동일 날짜 재마감 — @SQLRestriction 으로 삭제된 row 비표시 → 신규 생성 성공
        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.isLocked").value(true));
    }

    // ── 10. MASTER unlock → 200 ──────────────────────────────────────────────

    @Test
    @DisplayName("MASTER 역마감 — PATCH /{closingDate}/lock 200")
    void testUnlockSuccess() throws Exception {
        // (a) 마감 생성 (잠금됨)
        Map<String, Object> closeBody = new HashMap<>();
        closeBody.put("closingDate", "2026-05-21");
        closeBody.put("scopeMode", "ALL");
        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", MASTER_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(closeBody)))
                .andExpect(status().isCreated());

        // (b) MASTER 역마감
        Map<String, Object> unlockBody = new HashMap<>();
        unlockBody.put("locked", false);
        mockMvc.perform(patch("/accounting/daily-closings/2026-05-21/lock")
                        .header("X-User-Id", MASTER_ID)
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(unlockBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isLocked").value(false));
    }

    // ── 11. ACCOUNTANT unlock → 403 ──────────────────────────────────────────

    @Test
    @DisplayName("ACCOUNTANT 역마감 시도 — 403 Forbidden (MASTER 독점)")
    void testUnlockForbiddenForAccountant() throws Exception {
        denyRequirePermission("accounting.daily-closing.unlock", PermissionAction.UPDATE);
        Mockito.when(dynamicPermissionClient.canEdit("ACCOUNTANT", "accounting.daily-closing.unlock"))
                .thenReturn(false);

        Map<String, Object> unlockBody = new HashMap<>();
        unlockBody.put("locked", false);
        mockMvc.perform(patch("/accounting/daily-closings/2026-05-22/lock")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(unlockBody)))
                .andExpect(status().isForbidden());
    }

    // ── 13. 기간 조회 partnerCode 필터 (#929 재수렴 T6) ─────────────────────

    @Test
    @DisplayName("일마감 기간 조회 — partnerCode 필터가 전체 마감을 배제하고 해당 거래처 마감만 반환한다 (#929 D)")
    void testGetDailyClosingsFilteredByPartnerCode() throws Exception {
        // 같은 날짜에 전체 마감 1건 + PARTNER_CODE 거래처 마감 1건을 만든다.
        Map<String, Object> allBody = new HashMap<>();
        allBody.put("closingDate", "2026-05-16");
        allBody.put("scopeMode", "ALL");
        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(allBody)))
                .andExpect(status().isCreated());

        Map<String, Object> partnerBody = new HashMap<>();
        partnerBody.put("closingDate", "2026-05-16");
        partnerBody.put("partnerCode", PARTNER_CODE);
        partnerBody.put("scopeMode", "SELECTED");
        mockMvc.perform(post("/accounting/daily-closings")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(partnerBody)))
                .andExpect(status().isCreated());

        // partnerCode 미지정 — 2건 모두(무훼손, 기존 동작 그대로).
        mockMvc.perform(get("/accounting/daily-closings")
                        .param("from", "2026-05-16")
                        .param("to", "2026-05-16")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(2));

        // partnerCode=PC001 — 그 거래처 마감 1건만(전체 마감 행은 배제).
        mockMvc.perform(get("/accounting/daily-closings")
                        .param("from", "2026-05-16")
                        .param("to", "2026-05-16")
                        .param("partnerCode", PARTNER_CODE)
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].partnerCode").value(PARTNER_CODE));

        // partnerCode=NOTEXIST(미존재 거래처) — 하드 오류가 아니라 빈 페이지.
        mockMvc.perform(get("/accounting/daily-closings")
                        .param("from", "2026-05-16")
                        .param("to", "2026-05-16")
                        .param("partnerCode", "NOTEXIST")
                        .header("X-User-Id", ACCOUNTANT_ID)
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }

    // ── 12. MANAGER unlock → 403 ─────────────────────────────────────────────

    @Test
    @DisplayName("MANAGER 역마감 시도 — 403 Forbidden (MASTER 독점)")
    void testUnlockForbiddenForManager() throws Exception {
        denyRequirePermission("accounting.daily-closing.unlock", PermissionAction.UPDATE);
        Mockito.when(dynamicPermissionClient.canEdit("MANAGER", "accounting.daily-closing.unlock"))
                .thenReturn(false);

        Map<String, Object> unlockBody = new HashMap<>();
        unlockBody.put("locked", false);
        mockMvc.perform(patch("/accounting/daily-closings/2026-05-23/lock")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000103")
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(unlockBody)))
                .andExpect(status().isForbidden());
    }
}
