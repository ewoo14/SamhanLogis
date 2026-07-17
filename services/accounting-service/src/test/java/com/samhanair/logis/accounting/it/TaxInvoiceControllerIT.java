package com.samhanair.logis.accounting.it;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import jakarta.persistence.EntityManager;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * TaxInvoiceController IT (Phase 10 Step 8 — P0-4 #3).
 *
 * <p>5 시나리오:
 *
 * <ol>
 *   <li>발행 정상: DRAFT → ISSUED + 자동 분개 생성 (110/255/401)</li>
 *   <li>취소: ISSUED → CANCELLED + 자동 역분개</li>
 *   <li>자동 분개 검증: journals API 로 ISSUED 직후 분개 확인 — 차/대 합계 일치</li>
 *   <li>cancel 역분개 — 신규 역분개도 POSTED 로 보존</li>
 *   <li>마감된 회계 기간 원분개의 취소 차단 — #719 개발책임자 결정(세금계산서도 입금보고서와
 *       동일 차단, 기존 "마감이어도 역분개 허용" 예외 철회) + ISSUED/POSTED 불변 + 마감 해제 후 정상 취소</li>
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
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private EntityManager entityManager;

    /** 외부 client 격리 — IT 가 slip-service 호출하지 않음. */
    @MockBean private SlipServiceClient slipServiceClient;

    /** SP-09-1 e-Tax client 격리 — Phase 11 NTS 전환 시 IT 실 API 호출 방지 (D2). */
    @MockBean private ETaxClient eTaxClient;
    /** SP-09-4 KFTC 오픈뱅킹 client 격리 — Phase 11 sandbox 전환 시 IT 실 API 호출 방지. */
    @MockBean private KftcClient kftcClient;
    /** SP-D2 동적 권한 client 격리 — auth-service 호출 차단 (기본값 false = fallback 통과). */
    @MockBean(classes = com.samhanair.logis.security.permission.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

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

        denyRequirePermission("accounting.tax-invoice.list", PermissionAction.CREATE);
        denyDynamicPermissionFor("SALES");
        mockMvc.perform(post("/accounting/tax-invoices")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("issue — DRAFT → ISSUED + 자동 분개 (journalId 채워짐, 발행번호 yyyy/MM/dd-N)")
    void issueGeneratesJournal() throws Exception {
        Mockito.lenient().when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any())).thenReturn(0);

        String id = createDraft();

        MvcResult issueRes = mockMvc.perform(post("/accounting/tax-invoices/" + id + "/issue")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ISSUED"))
                .andExpect(jsonPath("$.data.issuedBy").value("00000000-0000-0000-0000-000000000101"))
                .andExpect(jsonPath("$.data.taxInvoiceNo").exists())
                .andExpect(jsonPath("$.data.journalId").exists())
                .andReturn();

        String journalId = objectMapper.readTree(issueRes.getResponse().getContentAsString())
                .get("data").get("journalId").asText();

        // 자동 분개 검증 — 차/대 합계 일치 (110 외상매출금 110000 / 255 부가세 10000 + 401 매출 100000)
        mockMvc.perform(get("/accounting/journals/" + journalId)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
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
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());

        // cancel (P0-4 — reason 필수)
        Map<String, Object> cancelBody = new HashMap<>();
        cancelBody.put("reason", "고객 요청으로 인한 취소");
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/cancel")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cancelBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"))
                .andExpect(jsonPath("$.data.cancelledBy").value("00000000-0000-0000-0000-000000000101"))
                .andExpect(jsonPath("$.data.cancelReason").value("고객 요청으로 인한 취소"))
                .andExpect(jsonPath("$.data.reverseJournalId").exists());
    }

    @Test
    @DisplayName("마감된 회계 기간 원분개의 세금계산서 취소는 409로 차단하고 ISSUED/POSTED를 보존하며, 마감 해제 후 정상 취소된다")
    void cancelBlockedWhenOriginalJournalDateIsClosedAndSucceedsAfterReopen() throws Exception {
        Mockito.lenient().when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any())).thenReturn(0);

        Map<String, Object> body = sampleBody();
        body.put("supplyDate", "2026-07-01");
        MvcResult created = mockMvc.perform(post("/accounting/tax-invoices")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andReturn();
        String id = data(created).get("id").asText();

        MvcResult issued = mockMvc.perform(post("/accounting/tax-invoices/" + id + "/issue")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andReturn();
        UUID originalJournalId = UUID.fromString(data(issued).get("journalId").asText());
        // 발행 직후 pending INSERT(Journal/JournalLine)를 raw JDBC 조회가 볼 수 있도록 명시 flush
        // (CashReceiptControllerIT confirmAndPatchBlockedForClosedPeriod 와 동일 사유 — 조기 종료
        // 경로 자체는 flush 를 유발하는 쿼리가 없다).
        entityManager.flush();

        // 발행 이후 원분개 일자(supplyDate)를 포함하는 월을 마감한다 — CashReceiptControllerIT 의
        // insertClosedMonthlyPeriod/reopenMonthlyPeriod 패턴 재사용.
        insertClosedMonthlyPeriod("2026-07-01");

        Map<String, Object> cancelBody = new HashMap<>();
        cancelBody.put("reason", "고객 요청으로 인한 취소");
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/cancel")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cancelBody)))
                .andExpect(status().isConflict());

        // ISSUED 불변 — 원분개는 POSTED 유지, 역분개는 생성되지 않는다
        // (#719 개발책임자 결정 — 세금계산서도 입금보고서와 동일 차단).
        org.assertj.core.api.Assertions.assertThat(taxInvoiceStatus(id)).isEqualTo("ISSUED");
        org.assertj.core.api.Assertions.assertThat(taxInvoiceReverseJournalId(id)).isNull();
        org.assertj.core.api.Assertions.assertThat(journalStatus(originalJournalId)).isEqualTo("POSTED");
        org.assertj.core.api.Assertions.assertThat(reversalCountForOriginal(originalJournalId)).isZero();

        // IT 전용 아티팩트 방지: 본 테스트는 두 HTTP 호출이 (테스트 @Transactional 특성상)
        // 같은 영속성 컨텍스트를 공유한다. 실제 운영에서는 요청마다 별도 세션이므로 문제되지
        // 않지만, 여기서는 1차 차단 시도의 ti.cancel() in-memory 변경(플러시는 안 됐음 — 위
        // 단언으로 확인됨)이 2차 호출의 재조회에 그대로 남아있지 않도록 evict 한다.
        entityManager.clear();

        // 마감 해제 후에는 정상적으로 취소 + 역분개된다.
        reopenMonthlyPeriod("2026-07-01");
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/cancel")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(cancelBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"))
                .andExpect(jsonPath("$.data.reverseJournalId").exists());
        // 재취소가 만든 원분개 REVERSED 마킹 + 신규 역분개 INSERT 를 raw JDBC 가 보도록 명시 flush.
        entityManager.flush();
        org.assertj.core.api.Assertions.assertThat(journalStatus(originalJournalId)).isEqualTo("REVERSED");
        org.assertj.core.api.Assertions.assertThat(reversalCountForOriginal(originalJournalId)).isOne();
    }

    @Test
    @DisplayName("issue 중복 — ISSUED 상태에서 /{id}/issue 재호출 → 409 CONFLICT")
    void issueAlreadyIssued_409() throws Exception {
        Mockito.lenient().when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any())).thenReturn(0);

        String id = createDraft();

        // 최초 발행 성공
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/issue")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ISSUED"));

        // 동일 세금계산서 재발행 → DRAFT 아니므로 CONFLICT
        MvcResult result = mockMvc.perform(post("/accounting/tax-invoices/" + id + "/issue")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict())
                .andReturn();

        org.assertj.core.api.Assertions.assertThat(dataMessage(result))
                .contains("임시저장")
                .contains("발행")
                .doesNotContain("DRAFT")
                .doesNotContain("ISSUED");
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
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updated)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.supplyAmount").value(200000.00));

        // issue
        mockMvc.perform(post("/accounting/tax-invoices/" + id + "/issue")
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());

        // ISSUED update → CONFLICT
        mockMvc.perform(put("/accounting/tax-invoices/" + id)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updated)))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("update — 거래처 교체 시 partnerId 도 반영 (#825 CH1: PUT 응답 + DB partner_id = P2, partnerName 정합)")
    void updateReflectsNewPartnerId() throws Exception {
        Mockito.lenient().when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any())).thenReturn(0);

        // P1 거래처로 DRAFT 생성
        UUID partner1 = UUID.randomUUID();
        Map<String, Object> createBody = sampleBody();
        createBody.put("partnerId", partner1.toString());
        MvcResult created = mockMvc.perform(post("/accounting/tax-invoices")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(createBody)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.partnerId").value(partner1.toString()))
                .andReturn();
        String id = data(created).get("id").asText();

        // P2 거래처로 교체 update — FE 는 새 거래처의 partnerId + 상호/사업자번호 snapshot 을 함께 전송
        UUID partner2 = UUID.randomUUID();
        Map<String, Object> updateBody = sampleBody();
        updateBody.put("partnerId", partner2.toString());
        updateBody.put("partnerName", "교체거래처");
        updateBody.put("partnerBusinessNo", "987-65-43210");
        mockMvc.perform(put("/accounting/tax-invoices/" + id)
                        .header("X-User-Id", "00000000-0000-0000-0000-000000000101")
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(updateBody)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.partnerId").value(partner2.toString()))
                .andExpect(jsonPath("$.data.partnerName").value("교체거래처"))
                .andExpect(jsonPath("$.data.partnerBusinessNo").value("987-65-43210"));

        // DB 정합 — 같은 테스트 트랜잭션의 pending UPDATE 를 raw JDBC 조회가 보도록 명시 flush
        // (본 IT 의 cancelBlocked... 테스트와 동일 사유).
        entityManager.flush();
        UUID dbPartnerId = jdbcTemplate.queryForObject(
                "SELECT partner_id FROM tax_invoices WHERE id = ?::uuid", UUID.class, id);
        String dbPartnerName = jdbcTemplate.queryForObject(
                "SELECT partner_name FROM tax_invoices WHERE id = ?::uuid", String.class, id);
        org.assertj.core.api.Assertions.assertThat(dbPartnerId).isEqualTo(partner2);
        org.assertj.core.api.Assertions.assertThat(dbPartnerName).isEqualTo("교체거래처");
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

    private com.fasterxml.jackson.databind.JsonNode data(MvcResult result) throws Exception {
        return objectMapper.readTree(
                result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).get("data");
    }

    private String dataMessage(MvcResult result) throws Exception {
        return objectMapper.readTree(
                result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).get("message").asText();
    }

    private String taxInvoiceStatus(String id) {
        return jdbcTemplate.queryForObject(
                "SELECT status FROM tax_invoices WHERE id = ?::uuid", String.class, id);
    }

    private UUID taxInvoiceReverseJournalId(String id) {
        return jdbcTemplate.queryForObject(
                "SELECT reverse_journal_id FROM tax_invoices WHERE id = ?::uuid", UUID.class, id);
    }

    private String journalStatus(UUID journalId) {
        return jdbcTemplate.queryForObject(
                "SELECT status FROM journals WHERE id = ?::uuid", String.class, journalId.toString());
    }

    /** SLIP 출처(세금계산서 자동 분개) 중 원분개를 참조하는 역분개 건수 — CashReceiptControllerIT 의 동명 헬퍼와 동일 패턴. */
    private int reversalCountForOriginal(UUID originalJournalId) {
        Integer count = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                  FROM journals
                 WHERE source_type = 'SLIP'
                   AND source_ref_id = ?::uuid
                """,
                Integer.class,
                originalJournalId.toString());
        return count == null ? 0 : count;
    }

    /** CashReceiptControllerIT 의 insertClosedMonthlyPeriod 재사용 — 월 1일 기준 CLOSED 마감 기간 삽입. */
    private void insertClosedMonthlyPeriod(String monthFirst) {
        jdbcTemplate.update("""
                INSERT INTO accounting_periods (
                    id, period_type, period_date, status, total_sales, total_purchase, total_expense,
                    locked_slip_count, version, created_at, created_by, is_deleted
                ) VALUES (gen_random_uuid(), 'MONTHLY', ?::date, 'CLOSED', 0, 0, 0, 0, 0, NOW(), 'IT', FALSE)
                """, monthFirst);
    }

    /** CashReceiptControllerIT 의 reopenMonthlyPeriod 재사용 — 마감 해제(OPEN 복원). */
    private void reopenMonthlyPeriod(String monthFirst) {
        jdbcTemplate.update("""
                UPDATE accounting_periods
                   SET status = 'OPEN',
                       reversed_at = NOW(),
                       reversed_by = 'IT'
                 WHERE period_type = 'MONTHLY'
                   AND period_date = ?::date
                """, monthFirst);
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
