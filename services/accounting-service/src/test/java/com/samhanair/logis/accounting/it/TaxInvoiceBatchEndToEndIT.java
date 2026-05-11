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
import java.io.ByteArrayInputStream;
import java.util.UUID;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
@SuppressWarnings("null") // ECJ @NonNull unchecked conversion — Gradle/JUnit 런타임 무영향
class TaxInvoiceBatchEndToEndIT extends AbstractPostgresIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;

    /** 외부 client 격리 — IT 가 외부 서비스 호출하지 않음. */
    @MockBean private SlipServiceClient slipServiceClient;
    @MockBean private PartnerLookupClient partnerLookupClient;
    @MockBean private ProductClient productClient;
    @MockBean private ChatRoomMappingClient chatRoomMappingClient;

    /** 고정 테스트 날짜 범위 */
    private static final LocalDate FROM = LocalDate.of(2026, 5, 1);
    private static final LocalDate TO   = LocalDate.of(2026, 5, 31);

    /** ACCOUNTANT 테스트 헤더 */
    private static final String USER_ID   = UUID.randomUUID().toString();
    private static final String USER_ROLE = "ACCOUNTANT";

    @BeforeEach
    void stubExternalClients() {
        Mockito.lenient()
               .when(slipServiceClient.lockByPeriod(Mockito.any(), Mockito.any()))
               .thenReturn(0);
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
            int dataRowCount = sheet.getLastRowNum(); // lastRowNum = 5 (rows 0..5, but 0 is header)
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

        // rows 배열에서 partnerCode 확인
        JsonNode rows = historyData.get("rows");
        assertThat(rows).isNotNull();
        assertThat(rows.isArray()).isTrue();
        assertThat(rows.size()).isEqualTo(3);

        // 모든 row 가 시드 partnerCode 와 일치
        for (JsonNode row : rows) {
            String partnerCode = row.path("partnerCode").asText("");
            assertThat(partnerCode)
                    .as("history 복원 rows[*].partnerCode")
                    .isEqualTo("QA-PC-SNAP");
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
                .andExpect(status().isCreated());

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

        long exclCount = 0;
        for (JsonNode row : rows) {
            if ("QA-PC-EXCL".equals(row.path("partnerCode").asText(""))) {
                exclCount++;
            }
        }
        assertThat(exclCount)
                .as("제외 거래처 QA-PC-EXCL 의 preview rows 포함 건수")
                .isEqualTo(0);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 내부 헬퍼
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * ISSUED 세금계산서 {@code count} 건을 MockMvc 로 seed.
     *
     * <p>POST /accounting/tax-invoices/issue-request (P0-4 {@code TaxInvoiceCreateRequest} DTO)
     * → issue 2단계 API 호출로 도메인 불변식 보장.
     * 각 계산서에 라인 1건 (운임료, 100,000원) 포함.
     *
     * @param count       생성할 계산서 수
     * @param partnerCode 사용자 노출 거래처 코드
     */
    private void seedIssuedInvoices(int count, String partnerCode) {
        for (int i = 0; i < count; i++) {
            try {
                Map<String, Object> body = buildInvoiceBody(partnerCode, i);
                // P0-4 endpoint 사용 (TaxInvoiceCreateRequest DTO schema 일치)
                MvcResult createResult = mockMvc.perform(
                                post("/accounting/tax-invoices/issue-request")
                                        .header("X-User-Id",   USER_ID)
                                        .header("X-User-Role", USER_ROLE)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .content(objectMapper.writeValueAsString(body)))
                        .andExpect(status().isCreated())
                        .andReturn();

                String id = objectMapper
                        .readTree(createResult.getResponse().getContentAsString())
                        .get("data").get("id").asText();

                // DRAFT → ISSUED
                mockMvc.perform(
                                post("/accounting/tax-invoices/{id}/issue", id)
                                        .header("X-User-Id",   USER_ID)
                                        .header("X-User-Role", USER_ROLE))
                        .andExpect(status().isOk());
            } catch (Exception ex) {
                throw new RuntimeException("세금계산서 seed 실패 (idx=" + i + "): " + ex.getMessage(), ex);
            }
        }
    }

    /**
     * 세금계산서 생성 요청 body 조립 — P0-4 {@code TaxInvoiceCreateRequest} schema.
     *
     * <p>POST /accounting/tax-invoices/issue-request 에 맞는 필드 구조:
     * partnerId(UUID) / partnerCode / partnerName / partnerBusinessNumber / issueDate / lines.
     *
     * @param partnerCode 거래처 코드 (사용자 노출 식별자)
     * @param seq         순번 (고유값 생성용)
     */
    private Map<String, Object> buildInvoiceBody(String partnerCode, int seq) {
        // TaxInvoiceLineRequest: itemName / specification / quantity / unit / unitPrice
        Map<String, Object> line = new HashMap<>();
        line.put("itemName",       "운임 기본료");
        line.put("specification",  "kg");
        line.put("quantity",       new BigDecimal("100"));
        line.put("unit",           "건");
        line.put("unitPrice",      new BigDecimal("1000"));

        Map<String, Object> body = new HashMap<>();
        // partnerId: 랜덤 UUID (IT seed 전용 — partner-service @MockBean 격리)
        body.put("partnerId",              UUID.randomUUID().toString());
        body.put("partnerCode",            partnerCode);
        body.put("partnerName",            "QA 거래처 " + partnerCode);
        // partnerBusinessNumber: XXX-XX-XXXXX 형식
        body.put("partnerBusinessNumber",  "123-45-" + String.format("%05d", seq % 100000));
        body.put("issueDate",              FROM.plusDays(seq % 28).toString());
        body.put("memo",                   "E2E-IT 세금계산서 seq=" + seq);
        body.put("lines",                  List.of(line));
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
            int dataRows = sheet.getLastRowNum(); // 0-based last row = 헤더(0) + 데이터(N) = N
            assertThat(dataRows)
                    .as("fileIndex=%d Excel 데이터 행 수", fileIndex)
                    .isEqualTo(expectedRows);
        }
    }
}
