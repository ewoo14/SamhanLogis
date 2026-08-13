package com.samhanair.logis.accounting.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.lenient;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeClient;
import com.samhanair.logis.accounting.client.ApprovalLineAuthorizeResult;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
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
 * JournalController + AccountController + TrialBalanceController 권한/라이프사이클 IT.
 *
 * <p>BE endpoint 권한 매트릭스 (Plan §4 + Q9):
 * <ul>
 *   <li>{@code GET    /accounting/accounts}           — ALL_AUTH (200)</li>
 *   <li>{@code POST   /accounting/journals}           — ACCOUNTANT/MASTER (201), SALES/MANAGER 403</li>
 *   <li>{@code GET    /accounting/journals}           — ACCOUNTANT/MASTER (200), SALES 403</li>
 *   <li>{@code GET    /accounting/journals/{id}}      — ACCOUNTANT/MASTER (200)</li>
 *   <li>{@code POST   /accounting/journals/{id}/post} — ACCOUNTANT/MASTER (200), 합계 mismatch 409</li>
 *   <li>{@code POST   /accounting/journals/{id}/reverse} — ACCOUNTANT/MASTER (200), DRAFT 면 409</li>
 *   <li>{@code GET    /accounting/journals/export.xlsx} — from/to 미지정 시 200 + 개방구간
 *       전체 조회 (#907 재수렴 R)</li>
 * </ul>
 *
 * <p>모든 응답은 ApiResponse 래핑 → jsonPath {@code $.data.*}.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class JournalControllerIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    /** SP-09-1 e-Tax client 격리 — Phase 11 NTS 전환 시 IT 실 API 호출 방지 (D2). */
    @MockBean private ETaxClient eTaxClient;
    /** SP-09-4 KFTC 오픈뱅킹 client 격리 — Phase 11 sandbox 전환 시 IT 실 API 호출 방지. */
    @MockBean private KftcClient kftcClient;
    /**
     * SP-D2 동적 권한 client 격리 — auth-service 호출 차단.
     * 기본값: null 반환 → Spring이 false로 처리 (lenient stub 없음 → fallback 적용).
     */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;
    /**
     * SP-08-FU2 cycle 2 fix (QA P1) — LedgerService / LedgerImageService 가 주입받는 외부 RestClient.
     * Eureka 비활성 IT 환경에서 loadBalancedRestClientBuilder 빈 해석 실패 또는 실 HTTP 호출 회피.
     */
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ApprovalLineAuthorizeClient approvalLineAuthorizeClient;

    @BeforeEach
    void setUpPartnerLookupStub() {
        lenient().when(partnerLookupClient.findByPartnerId(any())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerCode(any())).thenReturn(Optional.empty());
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(anyList())).thenReturn(Map.of());
        lenient().when(approvalLineAuthorizeClient.authorize(any(), any(), any()))
                .thenReturn(new ApprovalLineAuthorizeResult(false, false));
    }

    @Test
    @DisplayName("GET /accounting/accounts — SALES (ALL_AUTH) 200, 시드 50+ 확인")
    void accountTreeAllAuth() throws Exception {
        mockMvc.perform(get("/accounting/accounts")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(org.hamcrest.Matchers.greaterThanOrEqualTo(50)));
    }

    @Test
    @DisplayName("POST /accounting/journals — ACCOUNTANT 201, SALES 403, MANAGER 403")
    void createJournalAuthMatrix() throws Exception {
        Map<String, Object> body = balancedJournalBody("100000");

        // ACCOUNTANT 201
        mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andExpect(jsonPath("$.data.totalDebit").value(100000))
                .andExpect(jsonPath("$.data.totalCredit").value(100000));

        // SALES 403
        denyRequirePermission("accounting.journals", PermissionAction.CREATE);
        denyDynamicPermissionFor("SALES");
        mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());

        // MANAGER 403 (Q9 — MANAGER 제외)
        denyRequirePermission("accounting.journals", PermissionAction.CREATE);
        denyDynamicPermissionFor("MANAGER");
        mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MANAGER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("POST /accounting/journals — 통제 계정(100) 사용 시 400 INVALID_INPUT")
    void rejectsControlAccount() throws Exception {
        Map<String, Object> body = new HashMap<>(balancedJournalBody("50000"));
        // 라인의 첫 accountCode 를 통제 계정 "100" 으로 변조.
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lines = (List<Map<String, Object>>) body.get("lines");
        lines.get(0).put("accountCode", "100");

        mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("POST /accounting/journals — 라인 응답은 partnerName/accountName 을 표시하고 partnerId 는 숨긴다")
    void createJournalEnrichesLineNamesWithoutPartnerIdInResponse() throws Exception {
        UUID partnerId = UUID.fromString("00000000-0000-0000-0000-000000000713");
        lenient().when(partnerLookupClient.findByPartnerIdsBatch(anyList()))
                .thenReturn(Map.of(partnerId,
                        new com.samhanair.logis.accounting.client.PartnerSummary(
                                partnerId, "P-713", "삼한테스트상사", "123-45-67890", "서울")));

        Map<String, Object> body = balancedJournalBody("100000");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lines = (List<Map<String, Object>>) body.get("lines");
        lines.get(0).put("partnerId", partnerId);

        mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.lines[0].accountName").value("현금"))
                .andExpect(jsonPath("$.data.lines[0].partnerName").value("삼한테스트상사"))
                .andExpect(jsonPath("$.data.lines[0].partnerId").doesNotExist());
    }

    @Test
    @DisplayName("GET /accounting/partners/search — 분개 저장용 partnerId 를 포함한 거래처 검색")
    void searchJournalPartnerOptions() throws Exception {
        UUID partnerId = UUID.fromString("00000000-0000-0000-0000-000000000713");
        lenient().when(partnerLookupClient.searchDirectory(any(), anyInt()))
                .thenReturn(List.of(new com.samhanair.logis.accounting.client.PartnerSummary(
                        partnerId, "P-713", "삼한테스트상사", "123-45-67890", "서울")));

        mockMvc.perform(get("/accounting/partners/search")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .param("q", "삼한")
                        .param("limit", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].partnerId").value(partnerId.toString()))
                .andExpect(jsonPath("$.data[0].partnerCode").value("P-713"))
                .andExpect(jsonPath("$.data[0].name").value("삼한테스트상사"));
    }

    @Test
    @DisplayName("post 라이프사이클 — DRAFT → POSTED + reverse → REVERSED + 신규 역분개 POSTED")
    void postAndReverseLifecycle() throws Exception {
        String id = createJournalAsAccountant("70000");

        // DRAFT → POSTED
        mockMvc.perform(post("/accounting/journals/" + id + "/post")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("POSTED"))
                .andExpect(jsonPath("$.data.postedBy").value("00000000-0000-0000-0000-000000000101"));

        // POSTED → reverse → 신규 역분개 POSTED
        mockMvc.perform(post("/accounting/journals/" + id + "/reverse")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("POSTED"))
                .andExpect(jsonPath("$.data.lines[0].debitAmount").value(0))
                .andExpect(jsonPath("$.data.lines[0].creditAmount").value(70000))
                .andReturn();

        // 원분개 상태 검증
        mockMvc.perform(get("/accounting/journals/" + id)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("REVERSED"))
                .andExpect(jsonPath("$.data.reversedJournalId").exists());
    }

    @Test
    @DisplayName("post — 차/대 합계 mismatch 시 409 CONFLICT")
    void postMismatchConflict() throws Exception {
        // 라인 1: debit 100000 / 라인 2: credit 90000 → 합계 mismatch
        Map<String, Object> body = balancedJournalBody("100000");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> lines = (List<Map<String, Object>>) body.get("lines");
        lines.get(1).put("creditAmount", 90000);

        MvcResult res = mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String id = objectMapper.readTree(res.getResponse().getContentAsString())
                .get("data").get("id").asText();

        mockMvc.perform(post("/accounting/journals/" + id + "/post")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("reverse — DRAFT 분개에 reverse 호출 시 409 CONFLICT")
    void reverseDraftConflict() throws Exception {
        String id = createJournalAsAccountant("50000");
        MvcResult result = mockMvc.perform(post("/accounting/journals/" + id + "/reverse")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict())
                .andReturn();

        org.assertj.core.api.Assertions.assertThat(dataMessage(result))
                .contains("확정")
                .doesNotContain("POSTED")
                .doesNotContain("DRAFT");
    }

    /** 잔여 권한 시나리오 — MASTER 도 200, INVENTORY/WAREHOUSE 403. */
    @Test
    @DisplayName("권한 — MASTER 200, INVENTORY 403")
    void masterAndInventoryAuth() throws Exception {
        Map<String, Object> body = balancedJournalBody("10000");
        // MASTER 201
        mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());

        // INVENTORY 403
        denyRequirePermission("accounting.journals", PermissionAction.CREATE);
        denyDynamicPermissionFor("INVENTORY");
        mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "INVENTORY")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    private String createJournalAsAccountant(String amount) throws Exception {
        Map<String, Object> body = balancedJournalBody(amount);
        MvcResult res = mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString())
                .get("data").get("id").asText();
    }

    // ──────────────────────────── #907 재수렴 R ────────────────────────────

    /**
     * GET /accounting/journals/export.xlsx — from/to 미지정 시 개방구간(전체) 조회.
     *
     * <p>분개장 화면(JournalListPage)에는 기간 필터 UI 가 없어(상태 필터만 존재) 화면은 항상
     * 전체 기간을 보여준다. 고치기 전에는 from/to 가 필수 파라미터라 이 요청 자체가 400 이었고,
     * FE 는 이를 피하려 "당월"을 임의로 계산해 보내 화면에 없는 기간 제약을 파일이 만들었다
     * (P-2 위반 — 화면 115건 중 당월 export 는 그 일부만 포함). from/to 없이 호출해도 200 이고,
     * 당월 밖(2000-01-01)에 생성한 분개도 포함되어야 화면과 파일의 기본 범위가 같다.
     */
    @Test
    @DisplayName("#907 재수렴 R — export.xlsx from/to 미지정 시 200 + 당월 밖 분개도 포함(개방구간)")
    void exportXlsx_withoutFromTo_returns200AndIncludesJournalOutsideCurrentMonth() throws Exception {
        Map<String, Object> body = new HashMap<>(balancedJournalBody("123456"));
        body.put("journalDate", "2000-01-01");
        String marker = "OPUS재수렴R분개장전체조회마커9";
        body.put("description", marker);

        mockMvc.perform(post("/accounting/journals")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated());

        MvcResult result = mockMvc.perform(get("/accounting/journals/export.xlsx")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();

        try (Workbook wb = new XSSFWorkbook(
                new ByteArrayInputStream(result.getResponse().getContentAsByteArray()))) {
            Sheet sheet = wb.getSheetAt(0);
            assertThatSheetContainsText(sheet, marker);
        }
    }

    private void assertThatSheetContainsText(Sheet sheet, String text) {
        boolean found = false;
        for (Row row : sheet) {
            for (Cell cell : row) {
                if (cell.getCellType() == CellType.STRING && text.equals(cell.getStringCellValue())) {
                    found = true;
                }
            }
        }
        org.assertj.core.api.Assertions.assertThat(found)
                .as("시트에 마커 텍스트 '%s' 포함 여부", text)
                .isTrue();
    }

    private String dataMessage(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8))
                .get("message").asText();
    }

    private Map<String, Object> balancedJournalBody(String amount) {
        Map<String, Object> debitLine = new HashMap<>();
        debitLine.put("accountCode", "1019");
        debitLine.put("debitAmount", new BigDecimal(amount));
        debitLine.put("creditAmount", BigDecimal.ZERO);
        debitLine.put("memo", "현금 입금");

        Map<String, Object> creditLine = new HashMap<>();
        creditLine.put("accountCode", "4019");
        creditLine.put("debitAmount", BigDecimal.ZERO);
        creditLine.put("creditAmount", new BigDecimal(amount));
        creditLine.put("memo", "상품매출");

        Map<String, Object> body = new HashMap<>();
        body.put("journalDate", "2026-05-04");
        body.put("description", "테스트 분개");
        body.put("lines", List.of(debitLine, creditLine));
        return body;
    }
}
