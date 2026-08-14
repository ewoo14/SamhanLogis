package com.samhanair.logis.slip.it;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.permission.PermissionAction;
import com.samhanair.logis.slip.SlipServiceApplication;
import com.samhanair.logis.slip.client.InventoryClient;
import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.client.PartnerInternalClient;
import com.samhanair.logis.slip.client.ProductClient;
import com.samhanair.logis.slip.client.ProductSummary;
import com.samhanair.logis.slip.client.UserInternalClient;
import com.samhanair.logis.slip.client.WarehouseInternalClient;
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
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
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
 * P1-6 슬립 Excel export IT.
 *
 * <p>검증 범위:
 * <ol>
 *   <li>TC-1 — 미인증 요청 → 403</li>
 *   <li>TC-2 — MASTER 권한 export → 200 + Content-Type application/vnd.openxmlformats-officedocument.spreadsheetml.sheet</li>
 *   <li>TC-3 — Content-Disposition 헤더 attachment; filename* 포함 확인</li>
 *   <li>TC-4 — 응답 바이트가 유효한 .xlsx (XSSFWorkbook 파싱 성공)</li>
 *   <li>TC-5 — 시트 1장 이상 존재</li>
 *   <li>TC-6 — 헤더 행(row 0) 첫 셀이 비어있지 않음 (컬럼명 존재)</li>
 *   <li>TC-7 — 전표 1건 생성 후 export 시 데이터 행(row 1 이상) 1건 이상</li>
 *   <li>TC-8 — SALES 권한 export → 403 (관리자 전용 endpoint)</li>
 *   <li>TC-9 (#907 재수렴 R) — searchPartnerName 검색 필터가 export 에도 적용되어
 *       무관한 거래처 행이 섞이지 않는다 (판매관리 검색모달 파리티)</li>
 *   <li>TC-10 (#907 재수렴 R) — deliveryTag 필터가 export 에도 적용되고, from/to 를
 *       보내지 않아도(출고전표목록 화면은 기간 UI 가 없음) 200 으로 응답한다</li>
 * </ol>
 *
 * <p>외부 client 전종 @MockBean 격리 (메모리 {@code feedback_it_mockbean_external_clients}):
 * {@link InventoryClient} / {@link ProductClient} / {@link NotificationClient} /
 * {@link PartnerInternalClient}.
 *
 * <p>PR #134~#145 회고 가드:
 * - @MockitoSettings(LENIENT) 대신 Mockito.lenient() 로 선별 적용
 * - extends {@link AbstractPostgresIT} — Docker 미가용 시 자동 skip
 * - UUID 비공개 가드: 전표번호/거래처명만 노출, id 직접 비교 없음
 */
@SpringBootTest(classes = SlipServiceApplication.class)
@AutoConfigureMockMvc
@Transactional
class SlipExcelExportIT extends AbstractPostgresIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    /** InventoryClient — 재고 예약/차감 외부 호출 격리 */
    @MockBean
    private InventoryClient inventoryClient;

    /** ProductClient — product-service 제품 조회 격리 */
    @MockBean
    private ProductClient productClient;

    /** NotificationClient — 알림 발송 외부 호출 격리 */
    @MockBean
    private NotificationClient notificationClient;

    /** PartnerInternalClient — partner-service 내부 호출 격리 */
    @MockBean
    private PartnerInternalClient partnerInternalClient;
    /** SP-08-FU1 — UserInternalClient @MockBean 격리 (ownerFullName graceful fallback). */
    @MockBean
    private UserInternalClient userInternalClient;
    /** SP-08-FU2 P2-2 — WarehouseInternalClient @MockBean 격리. */
    @MockBean
    private WarehouseInternalClient warehouseInternalClient;

    /** 공통 export endpoint. BE 가 구현하면 URL 변경 가능 (현재 명세 기준). */
    private static final String EXPORT_URL = "/slips/export.xlsx";

    @BeforeEach
    void setupExternalMocks() {
        Mockito.lenient().when(userInternalClient.resolveFullName(ArgumentMatchers.any()))
                .thenReturn(Optional.of("담당자"));
        // ProductClient — lenient 설정: 전표 생성 시 제품 조회 stub
        Mockito.lenient().when(productClient.lookup(ArgumentMatchers.anyList()))
                .thenAnswer(inv -> {
                    List<UUID> ids = inv.getArgument(0);
                    return ids.stream()
                            .map(id -> new ProductSummary(
                                    id, "테스트 제품", "MOD-TEST-001",
                                    UUID.randomUUID(), new BigDecimal("50000"), "ACTIVE"))
                            .toList();
                });
        Mockito.lenient().when(productClient.requireExists(ArgumentMatchers.any()))
                .thenAnswer(inv -> new ProductSummary(
                        inv.getArgument(0), "테스트 제품", "MOD-TEST-001",
                        UUID.randomUUID(), new BigDecimal("50000"), "ACTIVE"));

        // NotificationClient — lenient void (발송 호출 무시). send() 메서드 없음;
        // sendUserSms / sendExternalSms / sendUserPush 각각 stub.
        Mockito.lenient().doNothing()
                .when(notificationClient).sendUserSms(
                        ArgumentMatchers.any(), ArgumentMatchers.anyString(), ArgumentMatchers.anyString());
        Mockito.lenient().doNothing()
                .when(notificationClient).sendExternalSms(
                        ArgumentMatchers.anyString(), ArgumentMatchers.anyString(), ArgumentMatchers.anyString());
        Mockito.lenient().doNothing()
                .when(notificationClient).sendUserPush(
                        ArgumentMatchers.any(), ArgumentMatchers.anyString(), ArgumentMatchers.anyString());
    }

    // ──────────────────────────── TC-1 ────────────────────────────

    /**
     * TC-1: 미인증 요청 → 403.
     * export endpoint 는 인증 필수; 헤더 없이 접근하면 403 반환.
     */
    @Test
    void tc1_unauthenticated_returns403() throws Exception {
        mockMvc.perform(get(EXPORT_URL))
                .andExpect(status().isForbidden());
    }

    // ──────────────────────────── TC-2 ────────────────────────────

    /**
     * TC-2: MASTER 권한 export → 200 + OOXML Content-Type.
     */
    @Test
    void tc2_masterRole_returns200WithOoxmlContentType() throws Exception {
        mockMvc.perform(get(EXPORT_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
    }

    // ──────────────────────────── TC-3 ────────────────────────────

    /**
     * TC-3: Content-Disposition 헤더에 attachment; filename* 포함.
     * 브라우저가 파일 다운로드 트리거하는 표준 헤더 형식.
     */
    @Test
    void tc3_masterRole_hasContentDispositionAttachment() throws Exception {
        mockMvc.perform(get(EXPORT_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition",
                        org.hamcrest.Matchers.containsString("attachment")));
    }

    // ──────────────────────────── TC-4 ────────────────────────────

    /**
     * TC-4: 응답 바이트가 유효한 .xlsx (XSSFWorkbook 파싱 무오류).
     * Apache POI XSSFWorkbook 으로 역직렬화 시 예외 없이 성공해야 함.
     */
    @Test
    void tc4_masterRole_responseBytesAreValidXlsx() throws Exception {
        MvcResult result = mockMvc.perform(get(EXPORT_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andReturn();

        byte[] body = result.getResponse().getContentAsByteArray();
        assertThat(body).isNotEmpty();

        // XSSFWorkbook 파싱 — 예외 없이 성공해야 유효한 .xlsx
        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(body))) {
            assertThat(wb).isNotNull();
        }
    }

    // ──────────────────────────── TC-5 ────────────────────────────

    /**
     * TC-5: export .xlsx 시트 1장 이상 존재.
     * "전표 목록" 시트 최소 1장.
     */
    @Test
    void tc5_masterRole_xlsxHasAtLeastOneSheet() throws Exception {
        MvcResult result = mockMvc.perform(get(EXPORT_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andReturn();

        try (Workbook wb = new XSSFWorkbook(
                new ByteArrayInputStream(result.getResponse().getContentAsByteArray()))) {
            assertThat(wb.getNumberOfSheets()).isGreaterThanOrEqualTo(1);
        }
    }

    // ──────────────────────────── TC-6 ────────────────────────────

    /**
     * TC-6: 헤더 행(row 0) 첫 셀이 비어있지 않음.
     * 전표 목록 컬럼명(전표번호 등) 이 최소 1개 이상 존재해야 함.
     */
    @Test
    void tc6_masterRole_headerRowFirstCellNotBlank() throws Exception {
        MvcResult result = mockMvc.perform(get(EXPORT_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andReturn();

        try (Workbook wb = new XSSFWorkbook(
                new ByteArrayInputStream(result.getResponse().getContentAsByteArray()))) {
            Sheet sheet = wb.getSheetAt(0);
            Row headerRow = sheet.getRow(0);
            assertThat(headerRow).isNotNull();
            assertThat(headerRow.getCell(0)).isNotNull();
            String headerValue = headerRow.getCell(0).getStringCellValue();
            assertThat(headerValue).isNotBlank();
        }
    }

    // ──────────────────────────── TC-7 ────────────────────────────

    /**
     * TC-7: 전표 1건 생성 후 export 시 데이터 행 1건 이상.
     * SALES 로 전표 1건 생성 → MASTER 로 export → row 1 이상 존재.
     */
    @Test
    void tc7_afterCreatingOneSlip_exportHasDataRow() throws Exception {
        // 전표 1건 생성 (SALES 권한)
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트 제품");
        line.put("modelName", "MOD-TEST-001");
        line.put("quantity", 3);
        line.put("unitPrice", 50000);
        line.put("note", "P1-6 test line");

        Map<String, Object> slipBody = new HashMap<>();
        slipBody.put("slipType", "OUTBOUND");
        slipBody.put("slipDate", "2026-05-11");
        slipBody.put("sourceWarehouseId", UUID.randomUUID().toString());
        slipBody.put("destinationWarehouseId", UUID.randomUUID().toString());
        slipBody.put("partnerId", UUID.randomUUID().toString());
        slipBody.put("partnerName", "P1-6 테스트 거래처");
        slipBody.put("deliveryTag", "DAY");
        slipBody.put("memo", "P1-6 Excel export IT");
        slipBody.put("lines", List.of(line));

        mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(slipBody)))
                .andExpect(status().isCreated());

        // export 후 데이터 행 검증
        MvcResult result = mockMvc.perform(get(EXPORT_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andReturn();

        try (Workbook wb = new XSSFWorkbook(
                new ByteArrayInputStream(result.getResponse().getContentAsByteArray()))) {
            Sheet sheet = wb.getSheetAt(0);
            // row 0 = 헤더, row 1+ = 데이터
            int lastRowNum = sheet.getLastRowNum();
            assertThat(lastRowNum).isGreaterThanOrEqualTo(1);
        }
    }

    // ──────────────────────────── TC-8 ────────────────────────────

    /**
     * TC-8: SALES 권한 export → 403.
     * export 는 MANAGER/MASTER 전용. SALES 는 차단.
     */
    @Test
    void tc8_salesRole_returns403() throws Exception {
        Mockito.when(dynamicPermissionClient.check(
                        ArgumentMatchers.any(UUID.class),
                        ArgumentMatchers.eq("slip.print.export"),
                        ArgumentMatchers.eq(PermissionAction.DOWNLOAD)))
                .thenReturn(false);

        mockMvc.perform(get(EXPORT_URL)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES"))
                .andExpect(status().isForbidden());
    }

    // ──────────────────────────── TC-9 (#907 재수렴 R) ────────────────────────────

    /**
     * TC-9: searchPartnerName 검색 필터가 export 에도 적용된다.
     *
     * <p>판매관리(SalesQueryPage) 검색모달과 동일 필드. 고치기 전에는 export 가 이 파라미터를
     * 받지 않아 slipType/from/to 범위의 전체 행이 나왔다 — 화면에서 거래처명으로 좁혀도
     * 파일은 무관한 거래처가 섞여 나오는 결함(예: 화면 1건 / 파일 222행).
     */
    @Test
    void tc9_searchPartnerName_filtersExportToMatchingRowsOnly() throws Exception {
        String marker = "OPUS재수렴검색전용거래처X9";
        createOutboundSlip(marker, null, "2026-05-11");
        createOutboundSlip("무관한거래처A9", null, "2026-05-11");
        createOutboundSlip("무관한거래처B9", null, "2026-05-11");

        MvcResult result = mockMvc.perform(get(EXPORT_URL)
                        .queryParam("slipType", "OUTBOUND")
                        .queryParam("from", "2000-01-01")
                        .queryParam("to", "2099-12-31")
                        .queryParam("searchPartnerName", marker)
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andReturn();

        try (Workbook wb = new XSSFWorkbook(
                new ByteArrayInputStream(result.getResponse().getContentAsByteArray()))) {
            Sheet sheet = wb.getSheetAt(0);
            assertThat(sheetContainsText(sheet, marker)).isTrue();
            // 무관한 거래처가 검색 결과에 섞여 나오면 안 됨 (필터가 무시되고 있었다면 섞여 나온다).
            assertThat(sheetContainsText(sheet, "무관한거래처A9")).isFalse();
            assertThat(sheetContainsText(sheet, "무관한거래처B9")).isFalse();
        }
    }

    // ──────────────────────────── TC-10 (#907 재수렴 R) ────────────────────────────

    /**
     * TC-10: deliveryTag 필터가 export 에도 적용되고, from/to 없이도 200 으로 응답한다.
     *
     * <p>출고전표목록(SlipListPage) 화면은 기간 필터 UI 가 없어 export 도 from/to 를 보내지
     * 않는다(고치기 전에는 FE 가 당월을 임의로 계산해 보내 화면 밖 조건을 파일이 만들었다 —
     * P-2 위반). deliveryTag 도 고치기 전에는 무시되어 화면에서 태그로 좁혀도 파일에는
     * 다른 태그 전표가 섞여 나왔다.
     */
    @Test
    void tc10_deliveryTag_filtersExportToMatchingRowsOnly_withoutDateBound() throws Exception {
        createOutboundSlip("DT거래처DAY9", "DAY", "2026-05-11");
        createOutboundSlip("DT거래처RENTAL9", "RENTAL", "2026-05-11");

        MvcResult result = mockMvc.perform(get(EXPORT_URL)
                        .queryParam("slipType", "OUTBOUND")
                        .queryParam("deliveryTag", "DAY")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "MASTER"))
                .andExpect(status().isOk())
                .andReturn();

        try (Workbook wb = new XSSFWorkbook(
                new ByteArrayInputStream(result.getResponse().getContentAsByteArray()))) {
            Sheet sheet = wb.getSheetAt(0);
            assertThat(sheetContainsText(sheet, "DT거래처DAY9")).isTrue();
            assertThat(sheetContainsText(sheet, "DT거래처RENTAL9")).isFalse();
        }
    }

    // ──────────────────────────── 테스트 헬퍼 ────────────────────────────

    /** OUTBOUND 전표 1건 생성 — partnerName/deliveryTag(선택)/slipDate 파라미터화 (tc7 패턴 재사용). */
    private void createOutboundSlip(String partnerName, String deliveryTag, String slipDate) throws Exception {
        Map<String, Object> line = new HashMap<>();
        line.put("productId", UUID.randomUUID().toString());
        line.put("productName", "테스트 제품");
        line.put("modelName", "MOD-TEST-001");
        line.put("quantity", 1);
        line.put("unitPrice", 10000);
        line.put("note", "#907 재수렴 R export 파리티 테스트");

        Map<String, Object> slipBody = new HashMap<>();
        slipBody.put("slipType", "OUTBOUND");
        slipBody.put("slipDate", slipDate);
        slipBody.put("sourceWarehouseId", UUID.randomUUID().toString());
        slipBody.put("destinationWarehouseId", UUID.randomUUID().toString());
        slipBody.put("partnerId", UUID.randomUUID().toString());
        slipBody.put("partnerName", partnerName);
        if (deliveryTag != null) {
            slipBody.put("deliveryTag", deliveryTag);
        }
        slipBody.put("memo", "#907 재수렴 R export 파리티 테스트");
        slipBody.put("lines", List.of(line));

        mockMvc.perform(post("/slips")
                        .header("X-User-Id", UUID.randomUUID().toString())
                        .header("X-User-Role", "SALES")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(slipBody)))
                .andExpect(status().isCreated());
    }

    /** 시트 전체(모든 row/cell)에서 문자열 셀 값이 정확히 일치하는 셀이 있는지 확인. */
    private boolean sheetContainsText(Sheet sheet, String text) {
        for (Row row : sheet) {
            for (Cell cell : row) {
                if (cell.getCellType() == CellType.STRING && text.equals(cell.getStringCellValue())) {
                    return true;
                }
            }
        }
        return false;
    }
}
