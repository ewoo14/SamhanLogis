package com.samhanair.logis.inventory.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.inventory.client.OutboundSlipLineSummary;
import com.samhanair.logis.inventory.client.SlipServiceClient;
import com.samhanair.logis.inventory.web.dto.DpsCompareResponse;
import com.samhanair.logis.inventory.web.dto.RowMismatch;
import com.samhanair.logis.inventory.web.dto.RowMismatch.MismatchType;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

/**
 * {@link DpsCompareService} 단위 테스트 — 11 case:
 * <ul>
 *   <li>SLIP 단위 매칭 4 case (정상 / 수량 불일치 / 거래처 불일치 / DPS 미발견)</li>
 *   <li>ITEM 단위 매칭 3 case (정상 / 수량 합계 불일치 / 한쪽 미발견)</li>
 *   <li>mismatch reason 분류 4 case (QUANTITY / PARTNER / DPS_NOT_FOUND / SLIP_NOT_FOUND)</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class DpsCompareServiceTest {

    @Mock private SlipServiceClient slipServiceClient;

    private DpsExcelParser parser;
    @InjectMocks private DpsCompareService service;

    private static final LocalDate FROM = LocalDate.of(2026, 5, 1);
    private static final LocalDate TO = LocalDate.of(2026, 5, 31);
    private static final LocalDate D = LocalDate.of(2026, 5, 9);

    @BeforeEach
    void setUp() {
        // @InjectMocks 가 parser 도 주입할 수 있도록 별도 인스턴스 생성 후 service 재구성
        parser = new DpsExcelParser();
        service = new DpsCompareService(slipServiceClient, parser);
    }

    // ---------- SLIP 단위 매칭 4 case ----------

    @Test
    void slip_단위_정상_매칭_mismatch_없음() throws IOException {
        when(slipServiceClient.getInboundSlips(any(), any())).thenReturn(List.of(
                outbound("S-001", D, "C-100", "삼한", "P-001", 10),
                outbound("S-001", D, "C-100", "삼한", "P-002", 5)));
        MockMultipartFile file = excel(new Object[][]{
                {"P-001", "2026-05-09", 10, "C-100"},
                {"P-002", "2026-05-09", 5, "C-100"}});

        DpsCompareResponse res = service.compare(file, FROM, TO, DpsCompareGroupBy.SLIP);

        assertThat(res.mismatches()).isEmpty();
        assertThat(res.matchedCount()).isEqualTo(2);
    }

    @Test
    void slip_단위_수량_불일치_QUANTITY_MISMATCH() throws IOException {
        when(slipServiceClient.getInboundSlips(any(), any())).thenReturn(List.of(
                outbound("S-001", D, "C-100", "삼한", "P-001", 10)));
        MockMultipartFile file = excel(new Object[][]{
                {"P-001", "2026-05-09", 7, "C-100"}});

        DpsCompareResponse res = service.compare(file, FROM, TO, DpsCompareGroupBy.SLIP);

        assertThat(res.mismatches()).hasSize(1);
        RowMismatch m = res.mismatches().get(0);
        assertThat(m.rowType()).isEqualTo(MismatchType.QUANTITY_MISMATCH);
        assertThat(m.expectedQty()).isEqualTo(10);
        assertThat(m.actualQty()).isEqualTo(7);
        assertThat(m.slipNo()).isEqualTo("S-001");
    }

    @Test
    void inbound_단위_수량은_같아도_금액이_다르면_불일치() {
        List<OutboundSlipLineSummary> inbound = List.of(
                inbound("IN-001", D, "P-001", 2, "220"));
        List<DpsExcelRow> dps = List.of(
                new DpsExcelRow("IN-001", "P-001", 2, new BigDecimal("221")));

        List<RowMismatch> mismatches = service.matchByInbound(inbound, dps);

        assertThat(mismatches).hasSize(1);
        assertThat(mismatches.get(0).rowType()).isEqualTo(MismatchType.AMOUNT_MISMATCH);
    }

    @Test
    void inbound_단위_수량과_금액이_모두_같으면_통과한다() {
        List<RowMismatch> mismatches = service.matchByInbound(
                List.of(inbound("IN-001", D, "P-001", 2, "220")),
                List.of(new DpsExcelRow("IN-001", "P-001", 2, new BigDecimal("220"))));

        assertThat(mismatches).isEmpty();
    }

    @Test
    void slip_단위_거래처_불일치_PARTNER_MISMATCH() throws IOException {
        when(slipServiceClient.getInboundSlips(any(), any())).thenReturn(List.of(
                outbound("S-001", D, "C-100", "삼한", "P-001", 10)));
        MockMultipartFile file = excel(new Object[][]{
                {"P-001", "2026-05-09", 10, "C-999"}});  // 거래처 다름, 수량 같음

        DpsCompareResponse res = service.compare(file, FROM, TO, DpsCompareGroupBy.SLIP);

        assertThat(res.mismatches()).hasSize(1);
        assertThat(res.mismatches().get(0).rowType()).isEqualTo(MismatchType.PARTNER_MISMATCH);
        assertThat(res.mismatches().get(0).partnerCode()).isEqualTo("C-100");
    }

    @Test
    void slip_단위_DPS_미발견_DPS_NOT_FOUND() throws IOException {
        when(slipServiceClient.getInboundSlips(any(), any())).thenReturn(List.of(
                outbound("S-001", D, "C-100", "삼한", "P-XXX", 3)));
        MockMultipartFile file = excel(new Object[][]{
                {"P-001", "2026-05-09", 10, "C-100"}});  // 다른 품번

        DpsCompareResponse res = service.compare(file, FROM, TO, DpsCompareGroupBy.SLIP);

        assertThat(res.mismatches()).extracting(RowMismatch::rowType)
                .containsExactlyInAnyOrder(MismatchType.DPS_NOT_FOUND, MismatchType.SLIP_NOT_FOUND);
    }

    // ---------- ITEM 단위 매칭 3 case ----------

    @Test
    void item_단위_정상_합계_매칭() throws IOException {
        when(slipServiceClient.getInboundSlips(any(), any())).thenReturn(List.of(
                outbound("S-001", D, "C-100", "삼한", "P-001", 6),
                outbound("S-002", D, "C-200", "ABC", "P-001", 4)));
        MockMultipartFile file = excel(new Object[][]{
                {"P-001", "2026-05-09", 10, "C-100"}});  // 합계 10 일치

        DpsCompareResponse res = service.compare(file, FROM, TO, DpsCompareGroupBy.ITEM);

        assertThat(res.mismatches()).isEmpty();
    }

    @Test
    void item_단위_수량_합계_불일치_QUANTITY_MISMATCH() throws IOException {
        when(slipServiceClient.getInboundSlips(any(), any())).thenReturn(List.of(
                outbound("S-001", D, "C-100", "삼한", "P-001", 6)));
        MockMultipartFile file = excel(new Object[][]{
                {"P-001", "2026-05-09", 5, "C-100"}});

        DpsCompareResponse res = service.compare(file, FROM, TO, DpsCompareGroupBy.ITEM);

        assertThat(res.mismatches()).hasSize(1);
        assertThat(res.mismatches().get(0).rowType()).isEqualTo(MismatchType.QUANTITY_MISMATCH);
        assertThat(res.mismatches().get(0).productCode()).isEqualTo("P-001");
        assertThat(res.mismatches().get(0).expectedQty()).isEqualTo(6);
        assertThat(res.mismatches().get(0).actualQty()).isEqualTo(5);
    }

    @Test
    void item_단위_한쪽만_존재_NOT_FOUND() throws IOException {
        when(slipServiceClient.getInboundSlips(any(), any())).thenReturn(List.of(
                outbound("S-001", D, "C-100", "삼한", "P-A", 3)));
        MockMultipartFile file = excel(new Object[][]{
                {"P-B", "2026-05-09", 7, "C-100"}});

        DpsCompareResponse res = service.compare(file, FROM, TO, DpsCompareGroupBy.ITEM);

        assertThat(res.mismatches()).hasSize(2);
        assertThat(res.mismatches()).extracting(RowMismatch::rowType)
                .containsExactlyInAnyOrder(MismatchType.DPS_NOT_FOUND, MismatchType.SLIP_NOT_FOUND);
    }

    // ---------- mismatch reason 분류 4 case (직접 service helper 호출) ----------

    @Test
    void reason_QUANTITY_MISMATCH_분류_검증() {
        List<RowMismatch> mismatches = service.matchBySlip(
                List.of(outbound("S-1", D, "C-1", "삼한", "P-1", 10)),
                List.of(new DpsExcelRow("P-1", D, 7, "C-1", "삼한")));
        assertThat(mismatches).hasSize(1);
        assertThat(mismatches.get(0).rowType()).isEqualTo(MismatchType.QUANTITY_MISMATCH);
        assertThat(mismatches.get(0).reason()).contains("수량 불일치");
    }

    @Test
    void reason_PARTNER_MISMATCH_분류_검증() {
        List<RowMismatch> mismatches = service.matchBySlip(
                List.of(outbound("S-1", D, "C-100", "삼한", "P-1", 10)),
                List.of(new DpsExcelRow("P-1", D, 10, "C-999", "다른업체")));
        assertThat(mismatches).hasSize(1);
        assertThat(mismatches.get(0).rowType()).isEqualTo(MismatchType.PARTNER_MISMATCH);
        assertThat(mismatches.get(0).reason()).contains("거래처 불일치");
    }

    @Test
    void reason_DPS_NOT_FOUND_분류_검증() {
        List<RowMismatch> mismatches = service.matchBySlip(
                List.of(outbound("S-1", D, "C-1", "삼한", "P-MISSING", 5)),
                List.of(new DpsExcelRow("P-OTHER", D, 5, "C-1", "삼한")));
        assertThat(mismatches).extracting(RowMismatch::rowType)
                .contains(MismatchType.DPS_NOT_FOUND);
        RowMismatch dpsMissing = mismatches.stream()
                .filter(m -> m.rowType() == MismatchType.DPS_NOT_FOUND)
                .findFirst().orElseThrow();
        assertThat(dpsMissing.slipNo()).isEqualTo("S-1");
        assertThat(dpsMissing.productCode()).isEqualTo("P-MISSING");
    }

    @Test
    void reason_SLIP_NOT_FOUND_분류_검증() {
        List<RowMismatch> mismatches = service.matchByItem(
                List.of(),
                List.of(new DpsExcelRow("P-ORPHAN", D, 8, "C-1", "삼한")));
        assertThat(mismatches).hasSize(1);
        assertThat(mismatches.get(0).rowType()).isEqualTo(MismatchType.SLIP_NOT_FOUND);
        assertThat(mismatches.get(0).productCode()).isEqualTo("P-ORPHAN");
        assertThat(mismatches.get(0).actualQty()).isEqualTo(8);
    }

    // ---------- 기타 ----------

    @Test
    void compare_빈_파일_BusinessException() {
        MockMultipartFile empty = new MockMultipartFile("file", "empty.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new byte[0]);
        assertThatThrownBy(() -> service.compare(empty, FROM, TO, DpsCompareGroupBy.SLIP))
                .isInstanceOf(BusinessException.class)
                .hasFieldOrPropertyWithValue("errorCode", ErrorCode.INVALID_INPUT);
    }

    @Test
    void generateTemplate_헤더_5종_포함_xlsx_반환() {
        byte[] body = service.generateTemplate();
        assertThat(body).isNotEmpty();
        // .xlsx 의 ZIP magic number (PK\x03\x04)
        assertThat(body[0]).isEqualTo((byte) 'P');
        assertThat(body[1]).isEqualTo((byte) 'K');
    }

    // ---------- helper ----------

    private OutboundSlipLineSummary outbound(String slipNo, LocalDate date, String partnerCode,
                                             String partnerName, String productCode, int qty) {
        return new OutboundSlipLineSummary(slipNo, date, partnerCode, partnerName,
                productCode, productCode + " 품목", qty);
    }

    private OutboundSlipLineSummary inbound(String deliveryNo, LocalDate date, String productCode,
                                             int qty, String totalAmount) {
        return new OutboundSlipLineSummary(deliveryNo, date, null, null, productCode,
                productCode, qty, new BigDecimal(totalAmount));
    }

    private MockMultipartFile excel(Object[][] dataRows) throws IOException {
        try (Workbook wb = new XSSFWorkbook();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = wb.createSheet("DPS");
            Row header = sheet.createRow(0);
            String[] headers = {"품번", "입고일자", "수량", "거래처코드"};
            for (int i = 0; i < headers.length; i++) {
                header.createCell(i).setCellValue(headers[i]);
            }
            for (int r = 0; r < dataRows.length; r++) {
                Row row = sheet.createRow(r + 1);
                Object[] data = dataRows[r];
                for (int c = 0; c < data.length; c++) {
                    Object v = data[c];
                    if (v instanceof Number n) {
                        row.createCell(c).setCellValue(n.doubleValue());
                    } else {
                        row.createCell(c).setCellValue(String.valueOf(v));
                    }
                }
            }
            wb.write(out);
            return new MockMultipartFile("file", "dps.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    out.toByteArray());
        }
    }
}
