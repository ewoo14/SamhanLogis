package com.samhanair.logis.accounting.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.AccountingServiceApplication;
import com.samhanair.logis.accounting.client.ChatRoomMappingClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
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
 * P0-4 세금계산서 발행 시나리오 검증용 IT.
 *
 * <p>V12 Flyway seed ({@code V12__seed_tax_invoice_issuance.sql}) 6건 적재 환경에서
 * 세금계산서 전체 라이프사이클을 검증한다.
 *
 * <p>검증 시나리오:
 * <ol>
 *   <li>POST /accounting/tax-invoices — DRAFT 생성 (ACCOUNTANT 201 / 입력 검증 400)</li>
 *   <li>POST /accounting/tax-invoices/{id}/issue — DRAFT → ISSUED 전이
 *       (발행번호 yyyyMMdd-NNNN + journalId 자동 생성)</li>
 *   <li>POST /accounting/tax-invoices/{id}/cancel — ISSUED → CANCELLED
 *       (cancelledBy 설정 + reverseJournalId 채워짐)</li>
 *   <li>GET /accounting/tax-invoices/{id} — 단건 조회 (라인 포함 인쇄 응답)</li>
 *   <li>GET /accounting/tax-invoices?status=ISSUED — ISSUED 페이지 조회
 *       (V12 seed 3건 이상 포함)</li>
 * </ol>
 *
 * <p>이중 가드: {@code AbstractPostgresIT} Testcontainers PostgreSQL + Flyway V1~V12 자동 적용.
 * Docker 미가용 환경에서는 {@link AbstractPostgresIT.DockerAvailableCondition} 이 skip 처리.
 *
 * <p>외부 client {@code @MockBean} 격리 4종
 * ({@code feedback_it_mockbean_external_clients} 가드 준수):
 * SlipServiceClient / ProductClient / PartnerLookupClient / ChatRoomMappingClient.
 *
 * <p>{@code @Transactional} 적용 — 테스트 후 자동 롤백으로 DB 상태 보호.
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
@SuppressWarnings("null") // MockMvc fluent API @NonNull JDT 경고 억제 (런타임 안전)
class P04ValidationIT extends AbstractPostgresIT {

    /** 외부 client @MockBean 격리 (feedback_it_mockbean_external_clients 가드 준수). */
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private ProductClient productClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private TaxInvoiceRepository taxInvoiceRepository;

    // ===== V12 seed UUID (결정적 하드코딩) =====
    private static final UUID ID_DRAFT_001 =
            UUID.fromString("c0d0e0f0-1234-5678-abcd-000000000101");
    private static final UUID ID_ISSUED_001 =
            UUID.fromString("c0d0e0f0-1234-5678-abcd-000000000201");
    private static final UUID ID_ISSUED_002 =
            UUID.fromString("c0d0e0f0-1234-5678-abcd-000000000202");
    private static final UUID ID_ISSUED_003 =
            UUID.fromString("c0d0e0f0-1234-5678-abcd-000000000203");
    private static final UUID ID_CANCELLED_001 =
            UUID.fromString("c0d0e0f0-1234-5678-abcd-000000000301");

    // -------------------------------------------------------------------------
    // 1. DRAFT 생성 시나리오
    // -------------------------------------------------------------------------

    /**
     * POST /accounting/tax-invoices — ACCOUNTANT 201 DRAFT 생성.
     *
     * <p>라인 2건 포함 요청 → DRAFT 상태 + VAT 10% 자동 계산 확인.
     * partnerBusinessNo 정상 형식 (NNN-NN-NNNNN) 검증.
     */
    @Test
    @DisplayName("POST /tax-invoices — ACCOUNTANT 201 DRAFT 생성 + VAT 10% 자동 계산")
    void createDraftReturns201WithCorrectVat() throws Exception {
        Mockito.lenient()
                .when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any()))
                .thenReturn(0);

        Map<String, Object> body = buildCreateRequest(
                UUID.randomUUID(), "111-22-33456", "테스트물류(주)", "서울시 강남구 역삼동",
                "2026-05-11", "P04ValidationIT DRAFT 생성 검증",
                List.of(
                        buildLine("항공운임", "건", "10", "100000", "5월 운임"),
                        buildLine("연료할증", "kg", "5", "50000", "5월 YQ")
                )
        );

        mockMvc.perform(post("/accounting/tax-invoices")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andExpect(jsonPath("$.data.supplyAmount").value(1250000.00))
                .andExpect(jsonPath("$.data.vatAmount").value(125000.00))
                .andExpect(jsonPath("$.data.totalAmount").value(1375000.00))
                .andExpect(jsonPath("$.data.partnerBusinessNo").value("111-22-33456"))
                .andExpect(jsonPath("$.data.lines").isArray());
    }

    /**
     * POST /accounting/tax-invoices — SALES 역할 403 Forbidden 확인.
     *
     * <p>권한 매트릭스: ACCOUNTANT/MASTER 만 세금계산서 DRAFT 생성 가능.
     */
    @Test
    @DisplayName("POST /tax-invoices — SALES 역할 403 Forbidden")
    void createDraftForbiddenForSalesRole() throws Exception {
        Map<String, Object> body = buildCreateRequest(
                UUID.randomUUID(), "222-33-44567", "무권한거래처", null,
                "2026-05-11", null,
                List.of(buildLine("운임", "건", "1", "100000", null))
        );

        mockMvc.perform(post("/accounting/tax-invoices")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isForbidden());
    }

    /**
     * POST /accounting/tax-invoices — 라인 0건 시 400 Bad Request.
     *
     * <p>CreateTaxInvoiceRequest @NotEmpty(lines) 검증.
     */
    @Test
    @DisplayName("POST /tax-invoices — 라인 0건 400 Bad Request")
    void createDraftRequiresAtLeastOneLine() throws Exception {
        Map<String, Object> body = buildCreateRequest(
                UUID.randomUUID(), "333-44-55678", "라인없는거래처", null,
                "2026-05-11", null,
                List.of()
        );

        mockMvc.perform(post("/accounting/tax-invoices")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "ACCOUNTANT")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest());
    }

    // -------------------------------------------------------------------------
    // 2. ISSUED 전이 시나리오
    // -------------------------------------------------------------------------

    /**
     * POST /accounting/tax-invoices/{id}/issue — DRAFT → ISSUED.
     *
     * <p>DRAFT 신규 생성 후 issue 호출 → ISSUED 전이 검증:
     * <ul>
     *   <li>status = ISSUED</li>
     *   <li>issuedBy = 요청 X-User-Id 헤더값</li>
     *   <li>taxInvoiceNo 채번됨 (형식: yyyyMMdd-NNNN)</li>
     *   <li>journalId 연결됨</li>
     * </ul>
     */
    @Test
    @DisplayName("POST /tax-invoices/{id}/issue — DRAFT → ISSUED + 발행번호 채번 + journalId 연결")
    void issueChangesStatusToIssuedWithJournalId() throws Exception {
        Mockito.lenient()
                .when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any()))
                .thenReturn(0);

        // DRAFT 신규 생성
        String draftId = createNewDraft();

        // issue 호출
        mockMvc.perform(post("/accounting/tax-invoices/" + draftId + "/issue")
                        .header("X-User-Id", "accountant-p04")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("ISSUED"))
                .andExpect(jsonPath("$.data.issuedBy").value("accountant-p04"))
                .andExpect(jsonPath("$.data.taxInvoiceNo").isString())
                .andExpect(jsonPath("$.data.journalId").isString());
    }

    /**
     * POST /accounting/tax-invoices/{id}/issue — 이미 ISSUED 상태일 때 409 Conflict.
     *
     * <p>DRAFT → ISSUED 후 재발행 시도 → 409 (중복 발행 방지).
     */
    @Test
    @DisplayName("POST /tax-invoices/{id}/issue — 이미 ISSUED 상태 409 Conflict (중복 발행 방지)")
    void issueTwiceReturns409() throws Exception {
        Mockito.lenient()
                .when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any()))
                .thenReturn(0);

        String draftId = createNewDraft();

        // 첫 번째 발행
        mockMvc.perform(post("/accounting/tax-invoices/" + draftId + "/issue")
                        .header("X-User-Id", "accountant-p04")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());

        // 두 번째 발행 시도 → 409
        mockMvc.perform(post("/accounting/tax-invoices/" + draftId + "/issue")
                        .header("X-User-Id", "accountant-p04")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict());
    }

    // -------------------------------------------------------------------------
    // 3. CANCELLED 전이 시나리오
    // -------------------------------------------------------------------------

    /**
     * POST /accounting/tax-invoices/{id}/cancel — ISSUED → CANCELLED.
     *
     * <p>DRAFT 생성 → issue → cancel 순서:
     * <ul>
     *   <li>status = CANCELLED</li>
     *   <li>cancelledBy = 요청 X-User-Id 헤더값</li>
     *   <li>reverseJournalId 연결됨 (자동 역분개)</li>
     * </ul>
     */
    @Test
    @DisplayName("POST /tax-invoices/{id}/cancel — ISSUED → CANCELLED + reverseJournalId 연결")
    void cancelChangesStatusToCancelledWithReverseJournalId() throws Exception {
        Mockito.lenient()
                .when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any()))
                .thenReturn(0);

        // DRAFT → ISSUED
        String draftId = createNewDraft();
        mockMvc.perform(post("/accounting/tax-invoices/" + draftId + "/issue")
                        .header("X-User-Id", "accountant-p04")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk());

        // ISSUED → CANCELLED
        mockMvc.perform(post("/accounting/tax-invoices/" + draftId + "/cancel")
                        .header("X-User-Id", "accountant-p04")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED"))
                .andExpect(jsonPath("$.data.cancelledBy").value("accountant-p04"))
                .andExpect(jsonPath("$.data.reverseJournalId").isString());
    }

    /**
     * POST /accounting/tax-invoices/{id}/cancel — DRAFT 상태에서 취소 시도 409 Conflict.
     *
     * <p>취소는 ISSUED 단계에서만 허용 (도메인 가드).
     */
    @Test
    @DisplayName("POST /tax-invoices/{id}/cancel — DRAFT 상태에서 취소 409 Conflict")
    void cancelDraftReturns409() throws Exception {
        Mockito.lenient()
                .when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any()))
                .thenReturn(0);

        String draftId = createNewDraft();

        // DRAFT 상태에서 cancel 시도 → 409
        mockMvc.perform(post("/accounting/tax-invoices/" + draftId + "/cancel")
                        .header("X-User-Id", "accountant-p04")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isConflict());
    }

    // -------------------------------------------------------------------------
    // 4. 단건 조회 (인쇄 응답) 시나리오
    // -------------------------------------------------------------------------

    /**
     * GET /accounting/tax-invoices/{id} — V12 seed ISSUED-001 단건 조회 (인쇄 응답).
     *
     * <p>V12 seed ISSUED-001 ({@code c0d0e0f0-...-000000000201}) — (주)CJ대한통운, ISSUED.
     * 라인 3건 포함 확인:
     * <ul>
     *   <li>taxInvoiceNo = SEED-P04-I001</li>
     *   <li>status = ISSUED</li>
     *   <li>lines 배열 크기 = 3</li>
     *   <li>supplyAmount = 3,000,000 / vatAmount = 300,000 / totalAmount = 3,300,000</li>
     * </ul>
     */
    @Test
    @DisplayName("GET /tax-invoices/{id} — V12 seed ISSUED-001 단건 조회 (인쇄 응답, 라인 3건)")
    void getOneSeedIssuedReturnsDetailWithLines() throws Exception {
        mockMvc.perform(get("/accounting/tax-invoices/" + ID_ISSUED_001)
                        .header("X-User-Id", "accountant-p04")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.taxInvoiceNo").value("SEED-P04-I001"))
                .andExpect(jsonPath("$.data.status").value("ISSUED"))
                .andExpect(jsonPath("$.data.partnerName").value("(주)CJ대한통운"))
                .andExpect(jsonPath("$.data.supplyAmount").value(3000000.00))
                .andExpect(jsonPath("$.data.vatAmount").value(300000.00))
                .andExpect(jsonPath("$.data.totalAmount").value(3300000.00))
                .andExpect(jsonPath("$.data.lines").isArray())
                .andExpect(jsonPath("$.data.lines.length()").value(3));
    }

    /**
     * GET /accounting/tax-invoices/{id} — V12 seed DRAFT-001 단건 조회.
     *
     * <p>DRAFT-001 ({@code c0d0e0f0-...-000000000101}) — (주)한진물류, DRAFT.
     * taxInvoiceNo = NULL (미발행), 라인 2건 확인.
     */
    @Test
    @DisplayName("GET /tax-invoices/{id} — V12 seed DRAFT-001 단건 조회 (taxInvoiceNo null, 라인 2건)")
    void getOneSeedDraftReturnsDetailWithNullTaxInvoiceNo() throws Exception {
        mockMvc.perform(get("/accounting/tax-invoices/" + ID_DRAFT_001)
                        .header("X-User-Id", "accountant-p04")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("DRAFT"))
                .andExpect(jsonPath("$.data.partnerName").value("(주)한진물류"))
                .andExpect(jsonPath("$.data.partnerBusinessNo").value("102-81-12301"))
                .andExpect(jsonPath("$.data.supplyAmount").value(2000000.00))
                .andExpect(jsonPath("$.data.vatAmount").value(200000.00))
                .andExpect(jsonPath("$.data.totalAmount").value(2200000.00))
                .andExpect(jsonPath("$.data.lines").isArray())
                .andExpect(jsonPath("$.data.lines.length()").value(2));
    }

    /**
     * GET /accounting/tax-invoices/{id} — V12 seed CANCELLED-001 단건 조회.
     *
     * <p>CANCELLED-001 ({@code c0d0e0f0-...-000000000301}) — (주)범한판토스, CANCELLED.
     * taxInvoiceNo = SEED-P04-C001, 라인 3건 포함 확인.
     */
    @Test
    @DisplayName("GET /tax-invoices/{id} — V12 seed CANCELLED-001 단건 조회 (CANCELLED + 라인 3건)")
    void getOneSeedCancelledReturnsDetailWithLines() throws Exception {
        mockMvc.perform(get("/accounting/tax-invoices/" + ID_CANCELLED_001)
                        .header("X-User-Id", "accountant-p04")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.taxInvoiceNo").value("SEED-P04-C001"))
                .andExpect(jsonPath("$.data.status").value("CANCELLED"))
                .andExpect(jsonPath("$.data.partnerName").value("(주)범한판토스"))
                .andExpect(jsonPath("$.data.supplyAmount").value(4000000.00))
                .andExpect(jsonPath("$.data.vatAmount").value(400000.00))
                .andExpect(jsonPath("$.data.totalAmount").value(4400000.00))
                .andExpect(jsonPath("$.data.cancelledBy").value("SYSTEM_SEED"))
                .andExpect(jsonPath("$.data.lines").isArray())
                .andExpect(jsonPath("$.data.lines.length()").value(3));
    }

    /**
     * GET /accounting/tax-invoices/{id} — 존재하지 않는 UUID 404 Not Found.
     */
    @Test
    @DisplayName("GET /tax-invoices/{id} — 존재하지 않는 UUID 404 Not Found")
    void getOneNotFoundReturns404() throws Exception {
        mockMvc.perform(get("/accounting/tax-invoices/" + UUID.randomUUID())
                        .header("X-User-Id", "accountant-p04")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isNotFound());
    }

    // -------------------------------------------------------------------------
    // 5. 페이지 조회 (status=ISSUED) 시나리오
    // -------------------------------------------------------------------------

    /**
     * GET /accounting/tax-invoices?status=ISSUED — V12 seed ISSUED 3건 이상 반환.
     *
     * <p>V12 seed 에서 ISSUED 3건 (ISSUED-001/002/003) 이 조회되어야 함.
     * 기존 V8 seed ISSUED 5건이 함께 존재하므로 총 8건 이상 확인.
     * content 배열 크기와 totalElements 검증.
     */
    @Test
    @DisplayName("GET /tax-invoices?status=ISSUED — V12 seed ISSUED 3건 포함 페이지 조회")
    void listIssuedIncludesV12SeedThreeRecords() throws Exception {
        MvcResult result = mockMvc.perform(get("/accounting/tax-invoices")
                        .param("status", "ISSUED")
                        .param("page", "0")
                        .param("size", "50")
                        .header("X-User-Id", "accountant-p04")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray())
                .andExpect(jsonPath("$.data.totalElements").isNumber())
                .andReturn();

        JsonNode data = objectMapper.readTree(
                result.getResponse().getContentAsString()).get("data");
        long total = data.get("totalElements").asLong();

        // V8 seed 5건 ISSUED + V12 seed 3건 ISSUED = 최소 3건 이상
        assertThat(total).as("ISSUED 총건수 (V12 seed 3건 이상)").isGreaterThanOrEqualTo(3L);

        // V12 seed 3건이 모두 포함되어 있는지 tax_invoice_no 로 확인
        JsonNode content = data.get("content");
        long v12IssuedCount = 0;
        for (JsonNode item : content) {
            String no = item.path("taxInvoiceNo").asText("");
            if (no.startsWith("SEED-P04-I")) {
                v12IssuedCount++;
            }
        }
        assertThat(v12IssuedCount)
                .as("V12 SEED-P04-I* ISSUED 건수")
                .isGreaterThanOrEqualTo(3L);
    }

    /**
     * GET /accounting/tax-invoices?status=DRAFT — V12 seed DRAFT 2건 이상 반환.
     *
     * <p>V12 seed DRAFT-001/DRAFT-002 2건이 조회되어야 함.
     */
    @Test
    @DisplayName("GET /tax-invoices?status=DRAFT — V12 seed DRAFT 2건 포함 페이지 조회")
    void listDraftIncludesV12SeedTwoRecords() throws Exception {
        // V12 seed DRAFT-001, DRAFT-002 개별 존재 확인
        assertThat(taxInvoiceRepository.findById(ID_DRAFT_001))
                .as("V12 seed DRAFT-001 존재 확인")
                .isPresent();

        MvcResult result = mockMvc.perform(get("/accounting/tax-invoices")
                        .param("status", "DRAFT")
                        .param("page", "0")
                        .param("size", "50")
                        .header("X-User-Id", "accountant-p04")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalElements").isNumber())
                .andReturn();

        long total = objectMapper.readTree(
                result.getResponse().getContentAsString())
                .get("data").get("totalElements").asLong();
        assertThat(total).as("DRAFT 총건수 (V12 seed 2건 이상)").isGreaterThanOrEqualTo(2L);
    }

    /**
     * GET /accounting/tax-invoices?status=ISSUED&from=2026-05-03&to=2026-05-09 — 기간 필터 조회.
     *
     * <p>2026-05-03 ~ 2026-05-09 기간 내 ISSUED 3건 (V12 ISSUED-001/002/003) 확인.
     */
    @Test
    @DisplayName("GET /tax-invoices?status=ISSUED&from&to — 기간 필터 조회 (V12 seed 3건)")
    void listIssuedWithDateRangeFilterReturnsV12Seeds() throws Exception {
        MvcResult result = mockMvc.perform(get("/accounting/tax-invoices")
                        .param("status", "ISSUED")
                        .param("from", "2026-05-03")
                        .param("to", "2026-05-09")
                        .param("page", "0")
                        .param("size", "50")
                        .header("X-User-Id", "accountant-p04")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content").isArray())
                .andReturn();

        JsonNode content = objectMapper.readTree(
                result.getResponse().getContentAsString())
                .get("data").get("content");

        long count = 0;
        for (JsonNode item : content) {
            String no = item.path("taxInvoiceNo").asText("");
            if (no.startsWith("SEED-P04-I")) {
                count++;
            }
        }
        assertThat(count).as("2026-05-03~09 기간 내 V12 ISSUED seed 건수").isGreaterThanOrEqualTo(3L);
    }

    /**
     * GET /accounting/tax-invoices/{id} — V12 seed ISSUED-002/003 단건 조회.
     *
     * <p>ISSUED-002 ({@code c0d0e0f0-...-000000000202}) — 롯데글로벌로지스(주), 라인 2건.
     * ISSUED-003 ({@code c0d0e0f0-...-000000000203}) — (주)SK에너지, 매입, 라인 2건.
     * 두 건 모두 ISSUED 상태 + partnerBusinessNo 정상 형식 확인.
     */
    @Test
    @DisplayName("GET /tax-invoices/{id} — V12 seed ISSUED-002/003 단건 조회 (파트너명 + 라인 2건)")
    void getOneSeedIssuedTwoAndThreeReturnCorrectDetail() throws Exception {
        // ISSUED-002: 롯데글로벌로지스(주), SALES, 라인 2건
        mockMvc.perform(get("/accounting/tax-invoices/" + ID_ISSUED_002)
                        .header("X-User-Id", "accountant-p04")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.taxInvoiceNo").value("SEED-P04-I002"))
                .andExpect(jsonPath("$.data.status").value("ISSUED"))
                .andExpect(jsonPath("$.data.partnerName").value("롯데글로벌로지스(주)"))
                .andExpect(jsonPath("$.data.partnerBusinessNo").value("116-81-20302"))
                .andExpect(jsonPath("$.data.supplyAmount").value(2500000.00))
                .andExpect(jsonPath("$.data.vatAmount").value(250000.00))
                .andExpect(jsonPath("$.data.totalAmount").value(2750000.00))
                .andExpect(jsonPath("$.data.lines.length()").value(2));

        // ISSUED-003: (주)SK에너지, PURCHASE(매입), 라인 2건
        mockMvc.perform(get("/accounting/tax-invoices/" + ID_ISSUED_003)
                        .header("X-User-Id", "accountant-p04")
                        .header("X-User-Role", "ACCOUNTANT"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.taxInvoiceNo").value("SEED-P04-I003"))
                .andExpect(jsonPath("$.data.status").value("ISSUED"))
                .andExpect(jsonPath("$.data.partnerName").value("(주)SK에너지"))
                .andExpect(jsonPath("$.data.partnerBusinessNo").value("125-81-20303"))
                .andExpect(jsonPath("$.data.supplyAmount").value(1800000.00))
                .andExpect(jsonPath("$.data.vatAmount").value(180000.00))
                .andExpect(jsonPath("$.data.totalAmount").value(1980000.00))
                .andExpect(jsonPath("$.data.lines.length()").value(2));
    }

    // -------------------------------------------------------------------------
    // 헬퍼 메서드
    // -------------------------------------------------------------------------

    /**
     * DRAFT 신규 생성 헬퍼 — 라인 2건 포함.
     *
     * @return 생성된 TaxInvoice UUID 문자열
     */
    private String createNewDraft() throws Exception {
        Map<String, Object> body = buildCreateRequest(
                UUID.randomUUID(), "444-55-66789", "P04IT테스트거래처(주)", "서울시 영등포구",
                "2026-05-11", "P04ValidationIT 신규 DRAFT",
                List.of(
                        buildLine("운임 기본료", "건", "50", "20000", "5월 기본 운임"),
                        buildLine("보험료", "건", "1", "50000", "5월 화물보험")
                )
        );
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

    /**
     * CreateTaxInvoiceRequest body 생성 헬퍼.
     */
    private Map<String, Object> buildCreateRequest(
            UUID partnerId, String businessNo, String partnerName, String address,
            String supplyDate, String description, List<Map<String, Object>> lines) {
        Map<String, Object> body = new HashMap<>();
        body.put("partnerId", partnerId.toString());
        if (businessNo != null) body.put("partnerBusinessNo", businessNo);
        body.put("partnerName", partnerName);
        if (address != null) body.put("partnerAddress", address);
        body.put("supplyDate", supplyDate);
        if (description != null) body.put("description", description);
        body.put("lines", lines);
        return body;
    }

    /**
     * CreateTaxInvoiceLineRequest Map 생성 헬퍼.
     */
    private Map<String, Object> buildLine(String itemName, String spec,
                                          String quantity, String unitPrice, String memo) {
        Map<String, Object> line = new HashMap<>();
        line.put("itemName", itemName);
        if (spec != null) line.put("spec", spec);
        line.put("quantity", new BigDecimal(quantity));
        line.put("unitPrice", new BigDecimal(unitPrice));
        if (memo != null) line.put("memo", memo);
        return line;
    }
}
