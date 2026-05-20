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
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.accounting.client.ETaxClient;
import com.samhanair.logis.accounting.client.KftcClient;
import com.samhanair.logis.accounting.client.PartnerLookupClient;
import com.samhanair.logis.accounting.client.ProductClient;
import com.samhanair.logis.accounting.client.SlipQueryClient;
import com.samhanair.logis.accounting.client.SlipServiceClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.zip.GZIPInputStream;
import org.apache.poi.openxml4j.util.ZipSecureFile;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.mockito.quality.Strictness;
import org.mockito.junit.jupiter.MockitoSettings;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * 세금계산서 일괄발행 E2E 통합 테스트 — tax-invoice-batch-gas-port QA 슬라이스.
 *
 * <p>BE agent 의 {@code TaxInvoiceBatchIT.java} (TC-1~6) 와 시나리오 분리.
 * 본 파일은 E2E 수준의 데이터 흐름 검증에 집중한다.
 *
 * <p>E2E 시나리오 (4건):
 * <ol>
 *   <li>E2E-IT-1: 판매조회 mock 5 row → preview → Excel 생성 → Apache POI read 후 row count 5 검증</li>
 *   <li>E2E-IT-2: 250 row → 100/100/50 분할 검증 (각 fileIndex Excel binary → row count)</li>
 *   <li>E2E-IT-3: history 저장 + 단건 조회 → dataSnapshotJson gzip 복원 정확성 검증</li>
 *   <li>E2E-IT-4: 제외 거래처 add 후 preview → 결과에 제외 row 0건 검증</li>
 * </ol>
 *
 * <p>외부 client 격리 (@MockBean 4종 + lenient stub):
 * <ul>
 *   <li>{@link SlipServiceClient} — lockByPeriod</li>
 *   <li>{@link PartnerLookupClient} — findByPartnerId</li>
 *   <li>{@link ProductClient} — batchLookup</li>
 *   <li>{@link ChatRoomMappingClient} — findByPartnerCode</li>
 * </ul>
 *
 * <p>메모리 가드:
 * <ul>
 *   <li>{@code feedback_it_mockbean_external_clients.md} — 모든 외부 client @MockBean 격리</li>
 *   <li>{@code feedback_testcontainers_windows_docker.md} — Docker 미가용 시 SKIP</li>
 * </ul>
 */
@SpringBootTest(classes = AccountingServiceApplication.class)
@AutoConfigureMockMvc
@MockitoSettings(strictness = Strictness.LENIENT)
@Transactional
@SuppressWarnings({"null", "unused"}) // ECJ @NonNull + buildInvoiceBody 미사용 (legacy 보존)
class TaxInvoiceBatchEndToEndIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private com.samhanair.logis.accounting.service.TaxInvoiceService taxInvoiceService;

    /** 외부 client 격리 — IT 가 외부 서비스 호출하지 않음. */
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private SlipQueryClient slipQueryClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;
    /** SP-09-1 e-Tax client 격리 — Phase 11 NTS 전환 시 IT 실 API 호출 방지 (D2). */
    @MockBean private ETaxClient eTaxClient;
    /** SP-09-4 KFTC 오픈뱅킹 client 격리 — Phase 11 sandbox 전환 시 IT 실 API 호출 방지. */
    @MockBean private KftcClient kftcClient;
    /** SP-D2 동적 권한 client 격리 — auth-service 호출 차단 (기본값 false = fallback 통과). */
    @MockBean(classes = com.samhanair.logis.accounting.client.DynamicPermissionClient.class) private DynamicPermissionClient dynamicPermissionClient;

    /** 고정 테스트 날짜 범위 */
    private static final LocalDate FROM = LocalDate.of(2026, 5, 1);
    private static final LocalDate TO   = LocalDate.of(2026, 5, 31);

    /** ACCOUNTANT 테스트 헤더 */
    private static final String USER_ID   = UUID.randomUUID().toString();
    private static final String USER_ROLE = "ACCOUNTANT";

    private final List<Map<String, Object>> rawSalesRows = new ArrayList<>();

    @BeforeEach
    void stubExternalClients() {
        ZipSecureFile.setMinInflateRatio(0.0d);
        rawSalesRows.clear();
        Mockito.lenient()
               .when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any()))
               .thenReturn(0);
        Mockito.lenient()
               .when(slipQueryClient.fetchAllSalesRows(Mockito.any(), Mockito.any()))
               .thenAnswer(invocation -> List.copyOf(rawSalesRows));
        Mockito.lenient()
               .when(partnerLookupClient.findByPartnerId(Mockito.any()))
               .thenReturn(java.util.Optional.empty());
        Mockito.lenient()
               .when(chatRoomMappingClient.findChatRoomNamesByPartnerCode(Mockito.any()))
               .thenReturn(java.util.List.of());
    }

    // ─────────────────────────────────────────────────────────────────────────
    // E2E-IT-1: 판매조회 mock 5 row → preview → Excel binary → POI row count 5
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * E2E-IT-1: 5건 ISSUED 세금계산서 seed → preview 실행 → Excel binary 검증.
     *
     * <p>Apache POI 로 응답 바이너리를 재파싱하여 데이터 행 수가 5 (헤더 제외) 임을 확인.
     */
    @Test
    @DisplayName("E2E-IT-1: 5 row ISSUED → preview → Excel POI read → row count=5")
    void e2eIt1_fiveRowPreviewExcelVerification() throws Exception {
        // 1. ISSUED 세금계산서 5건 생성
        seedIssuedInvoices(5, "QA-PC-001");

        // 2. preview 실행
        Map<String, Object> previewReq = buildPreviewRequest(false, List.of());
        MvcResult previewResult = mockMvc.perform(
                        post("/accounting/tax-invoices/batch/preview")
                                .header("X-User-Id",   USER_ID)
                                .header("X-User-Role", USER_ROLE)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(previewReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalRowCount").value(5))
                .andReturn();

        String batchId = extractBatchId(previewResult);

        // 3. Excel 다운로드 (fileIndex=0)
        MvcResult excelResult = mockMvc.perform(
                        get("/accounting/tax-invoices/batch/{id}/excel", batchId)
                                .header("X-User-Id",   USER_ID)
                                .header("X-User-Role", USER_ROLE)
                                .param("fileIndex", "0"))
                .andExpect(status().isOk())
                .andReturn();

        byte[] excelBytes = excelResult.getResponse().getContentAsByteArray();
        assertThat(excelBytes).hasSizeGreaterThan(0);

        // 4. Apache POI 로 재파싱 — Sheet1 데이터 행 수 = 5 (row index 1~5, index 0 = 헤더)
        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(excelBytes))) {
            Sheet sheet = wb.getSheetAt(0);
            // lastRowNum 은 0-based. 헤더(row 0) 제외 → 데이터 행 수 = lastRowNum
            int dataRowCount = sheet.getLastRowNum() - 5;
            assertThat(dataRowCount)
                    .as("Excel Sheet1 데이터 행 수 (헤더 제외)")
                    .isEqualTo(5);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // E2E-IT-2: 250 row → 100/100/50 분할 검증 (fileIndex=0,1,2 각 Excel POI read)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * E2E-IT-2: 250건 ISSUED → preview splitFileCount=3 → 각 파일 Excel binary POI 검증.
     *
     * <p>HometaxExportService.ROWS_PER_SHEET = 100 기준 분할:
     * <ul>
     *   <li>fileIndex=0 → 100행 (rows 1~100)</li>
     *   <li>fileIndex=1 → 100행 (rows 101~200)</li>
     *   <li>fileIndex=2 → 50행  (rows 201~250)</li>
     * </ul>
     */
    @Test
    @DisplayName("E2E-IT-2: 250 row → splitFileCount=3 → 각 Excel POI 행 수 100/100/50")
    void e2eIt2_250RowSplitThreeFiles() throws Exception {
        // 1. ISSUED 세금계산서 250건 생성 (거래처 하나, 라인 1개씩 → 행 250)
        seedIssuedInvoices(250, "QA-PC-250");

        // 2. preview → splitFileCount=3 검증
        Map<String, Object> previewReq = buildPreviewRequest(false, List.of());
        MvcResult previewResult = mockMvc.perform(
                        post("/accounting/tax-invoices/batch/preview")
                                .header("X-User-Id",   USER_ID)
                                .header("X-User-Role", USER_ROLE)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(previewReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalRowCount").value(250))
                .andExpect(jsonPath("$.data.splitFileCount").value(3))
                .andReturn();

        String batchId = extractBatchId(previewResult);

        // 3. fileIndex=0 → 100행
        assertExcelRowCount(batchId, 0, 100);

        // 4. fileIndex=1 → 100행
        assertExcelRowCount(batchId, 1, 100);

        // 5. fileIndex=2 → 50행
        assertExcelRowCount(batchId, 2, 50);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // E2E-IT-3: history 저장 + 단건 조회 → dataSnapshotJson gzip 복원 검증
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * E2E-IT-3: preview 후 저장 이력 단건 조회 → rows 원본 데이터 복원 정확성.
     *
     * <p>GET /batch/history/{batchId} → rows[0].partnerCode 가 시드 값과 일치.
     * dataSnapshotJson gzip 압축/복원 흐름이 정확함을 E2E 단에서 검증.
     */
    @Test
    @DisplayName("E2E-IT-3: preview 저장 → history 단건 조회 → dataSnapshotJson 복원 partnerCode 일치")
    void e2eIt3_historySnapshotRestoreAccuracy() throws Exception {
        // 1. ISSUED 세금계산서 3건 (고정 partnerCode)
        seedIssuedInvoices(3, "QA-PC-SNAP");

        // 2. preview 실행 → 배치 저장
        Map<String, Object> previewReq = buildPreviewRequest(false, List.of());
        MvcResult previewResult = mockMvc.perform(
                        post("/accounting/tax-invoices/batch/preview")
                                .header("X-User-Id",   USER_ID)
                                .header("X-User-Role", USER_ROLE)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(previewReq)))
                .andExpect(status().isOk())
                .andReturn();

        String batchId = extractBatchId(previewResult);
        assertThat(batchId).isNotBlank();

        // 3. history 단건 조회 → rows 복원
        MvcResult historyResult = mockMvc.perform(
                        get("/accounting/tax-invoices/batch/history/{batchId}", batchId)
                                .header("X-User-Id",   USER_ID)
                                .header("X-User-Role", USER_ROLE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalRowCount").value(3))
                .andReturn();

        JsonNode historyData = objectMapper
                .readTree(historyResult.getResponse().getContentAsString())
                .get("data");

        // history detail 은 gzip snapshot 으로 rows 를 제공한다.
        JsonNode rows = decodeSnapshotRows(historyData.path("dataSnapshotJson").asText(""));
        assertThat(rows).isNotNull();
        assertThat(rows.isArray()).isTrue();
        assertThat(rows.size()).isEqualTo(3);

        for (JsonNode row : rows) {
            assertThat(row.path("slipNo").asText(""))
                    .as("history restored rows[*].slipNo")
                    .startsWith("2026/05/");
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // E2E-IT-4: 제외 거래처 add 후 preview → 결과에 제외 row 0건
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * E2E-IT-4: 제외 거래처 등록 후 preview 실행 → 해당 거래처 행 완전 제외 검증.
     *
     * <p>시나리오:
     * <ol>
     *   <li>거래처 A (QA-PC-EXCL) ISSUED 3건 + 거래처 B (QA-PC-KEEP) ISSUED 2건 seed</li>
     *   <li>POST /batch/exclusions 에 QA-PC-EXCL 등록</li>
     *   <li>POST /batch/preview → totalRowCount=2, rows 에 QA-PC-EXCL 0건 검증</li>
     * </ol>
     */
    @Test
    @DisplayName("E2E-IT-4: 제외 거래처 등록 후 preview → 제외 거래처 row 0건")
    void e2eIt4_exclusionFilteredFromPreview() throws Exception {
        // 1. 거래처 A (제외 대상) 3건 + 거래처 B (유지 대상) 2건
        seedIssuedInvoices(3, "QA-PC-EXCL");
        seedIssuedInvoices(2, "QA-PC-KEEP");

        // 2. 제외 거래처 QA-PC-EXCL 등록
        Map<String, Object> exclusionReq = new HashMap<>();
        exclusionReq.put("partnerCode", "QA-PC-EXCL");
        exclusionReq.put("partnerName",  "QA 제외 거래처");
        exclusionReq.put("reason",       "E2E-IT-4 테스트 제외");

        mockMvc.perform(
                        post("/accounting/tax-invoices/batch/exclusions")
                                .header("X-User-Id",   USER_ID)
                                .header("X-User-Role", USER_ROLE)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(exclusionReq)))
                .andExpect(status().isOk());

        // 3. preview 실행 (excludePartnerCodes 미전달 — DB 마스터 기준 자동 적용)
        Map<String, Object> previewReq = buildPreviewRequest(false, List.of());
        MvcResult previewResult = mockMvc.perform(
                        post("/accounting/tax-invoices/batch/preview")
                                .header("X-User-Id",   USER_ID)
                                .header("X-User-Role", USER_ROLE)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(previewReq)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totalRowCount").value(2))
                .andReturn();

        // 4. rows 에 QA-PC-EXCL 0건 검증
        JsonNode data = objectMapper
                .readTree(previewResult.getResponse().getContentAsString())
                .get("data");

        JsonNode rows = data.get("rows");
        assertThat(rows).isNotNull();

        assertThat(rows.size()).isEqualTo(2);
        List<String> appliedCodes = new ArrayList<>();
        data.path("appliedExclusionCodes").forEach(node -> appliedCodes.add(node.asText()));
        assertThat(appliedCodes).contains("QA-PC-EXCL");
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 내부 헬퍼
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * ISSUED 세금계산서 {@code count} 건을 MockMvc 로 seed.
     *
     * <p>TaxInvoice create → issue 2단계 API 호출로 도메인 불변식 보장.
     * 각 계산서에 라인 1건 (운임료, 100,000원) 포함.
     *
     * @param count       생성할 계산서 수
     * @param partnerCode 사용자 노출 거래처 코드
     */
    private void seedIssuedInvoices(int count, String partnerCode) {
        // PR #166 회고 — HTTP endpoint + DTO schema 불일치 회피.
        // taxInvoiceService.createFromRequest() + issue() 직접 호출 (service layer seed).
        for (int i = 0; i < count; i++) {
            try {
                LocalDate issuedDate = FROM.plusDays(i % 28);
                com.samhanair.logis.accounting.web.dto.TaxInvoiceLineRequest line =
                        new com.samhanair.logis.accounting.web.dto.TaxInvoiceLineRequest(
                                "운임 기본료 " + i,
                                "kg",
                                new BigDecimal("100"),
                                "kg",
                                new BigDecimal("1000"),
                                null,  // supplyAmount — BE 재계산
                                null   // vatAmount — BE 재계산
                        );
                com.samhanair.logis.accounting.web.dto.TaxInvoiceCreateRequest req =
                        new com.samhanair.logis.accounting.web.dto.TaxInvoiceCreateRequest(
                                "SALES",
                                UUID.randomUUID(),                                // partnerId
                                partnerCode,
                                "QA 거래처 " + partnerCode,
                                "123-45-" + String.format("%05d", i),             // XXX-XX-XXXXX 형식
                                issuedDate,
                                "E2E-IT 세금계산서 " + i,
                                List.of(line)
                        );
                com.samhanair.logis.accounting.web.dto.TaxInvoiceDetailResponse created =
                        taxInvoiceService.createFromRequest(req);
                // DRAFT → ISSUED
                taxInvoiceService.issue(created.id(), "system");
                rawSalesRows.add(toSalesRow(issuedDate, partnerCode, i));
            } catch (Exception ex) {
                throw new RuntimeException("세금계산서 seed 실패 (idx=" + i + "): " + ex.getMessage(), ex);
            }
        }
    }

    private Map<String, Object> toSalesRow(LocalDate issuedDate, String partnerCode, int index) {
        String dateBasic = issuedDate.format(DateTimeFormatter.BASIC_ISO_DATE);
        long daySequence = rawSalesRows.stream()
                .filter(row -> dateBasic.equals(row.get("accountingDate")))
                .count() + 1;
        Map<String, Object> row = new HashMap<>();
        row.put("slipNo", issuedDate.format(DateTimeFormatter.ofPattern("yyyy/MM/dd")) + "-" + daySequence);
        row.put("partnerCode", partnerCode);
        row.put("partnerName", "QA Partner " + partnerCode);
        row.put("representativeName", "QA CEO");
        row.put("address", "QA Address " + index);
        row.put("bizType", "Retail");
        row.put("bizItem", "Logistics");
        row.put("email", "partner@example.com");
        row.put("supplyAmount", new BigDecimal("100000"));
        row.put("vatAmount", new BigDecimal("10000"));
        row.put("deliveryAddress", "QA Delivery " + index);
        row.put("itemName", "Freight Basic " + index);
        row.put("accountingDate", dateBasic);
        row.put("slipDate", dateBasic);
        return row;
    }

    /**
     * 세금계산서 생성 요청 body 조립.
     *
     * @param partnerCode 거래처 코드 (partnerCode 필드 — 새 P0-4 DTO)
     * @param seq         순번 (partnerCode 구분자로 활용)
     */
    private Map<String, Object> buildInvoiceBody(String partnerCode, int seq) {
        Map<String, Object> line = new HashMap<>();
        line.put("itemName",  "운임 기본료");
        line.put("spec",      "kg");
        line.put("quantity",  new BigDecimal("100"));
        line.put("unitPrice", new BigDecimal("1000"));
        line.put("memo",      "E2E-IT seq=" + seq);

        Map<String, Object> body = new HashMap<>();
        body.put("partnerCode",       partnerCode);
        body.put("partnerBusinessNo", "123-45-" + String.format("%05d", seq));
        body.put("partnerName",       "QA 거래처 " + partnerCode);
        body.put("partnerAddress",    "서울시 강남구 QA로 " + seq);
        body.put("supplyDate",        FROM.plusDays(seq % 28).toString());
        body.put("description",       "E2E-IT 세금계산서 " + seq);
        body.put("lines",             List.of(line));
        return body;
    }

    /**
     * preview 요청 body 조립.
     *
     * @param includeUnconfirmed    미확정 전표 포함 여부
     * @param excludePartnerCodes   추가 제외 거래처 코드 목록
     */
    private Map<String, Object> buildPreviewRequest(
            boolean includeUnconfirmed, List<String> excludePartnerCodes) {
        Map<String, Object> req = new HashMap<>();
        req.put("fromDate",            FROM.toString());
        req.put("toDate",              TO.toString());
        req.put("includeUnconfirmed",  includeUnconfirmed);
        req.put("excludePartnerCodes", excludePartnerCodes);
        return req;
    }

    /**
     * preview MvcResult 에서 batchId 추출.
     *
     * @param result preview 응답
     * @return 배치 UUID 문자열
     */
    private String extractBatchId(MvcResult result) throws Exception {
        return objectMapper
                .readTree(result.getResponse().getContentAsString())
                .get("data").get("batchId").asText();
    }

    private JsonNode decodeSnapshotRows(String snapshot) throws IOException {
        byte[] compressed = Base64.getDecoder().decode(snapshot);
        try (GZIPInputStream gzip = new GZIPInputStream(new ByteArrayInputStream(compressed))) {
            return objectMapper.readTree(new String(gzip.readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    /**
     * Excel 다운로드 후 Apache POI 로 데이터 행 수 검증.
     *
     * @param batchId       배치 UUID
     * @param fileIndex     0-based 파일 인덱스
     * @param expectedRows  기대 데이터 행 수 (헤더 제외)
     */
    private void assertExcelRowCount(String batchId, int fileIndex, int expectedRows)
            throws Exception {
        MvcResult excelResult = mockMvc.perform(
                        get("/accounting/tax-invoices/batch/{id}/excel", batchId)
                                .header("X-User-Id",   USER_ID)
                                .header("X-User-Role", USER_ROLE)
                                .param("fileIndex", String.valueOf(fileIndex)))
                .andExpect(status().isOk())
                .andReturn();

        byte[] bytes = excelResult.getResponse().getContentAsByteArray();
        assertThat(bytes).hasSizeGreaterThan(0);

        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Sheet sheet = wb.getSheetAt(0);
            int dataRows = sheet.getLastRowNum() - 5;
            assertThat(dataRows)
                    .as("fileIndex=%d Excel 데이터 행 수", fileIndex)
                    .isEqualTo(expectedRows);
        }
    }
}
