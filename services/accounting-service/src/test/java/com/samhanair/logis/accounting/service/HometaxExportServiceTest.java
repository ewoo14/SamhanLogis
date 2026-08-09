package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.accounting.domain.TaxInvoice;
import com.samhanair.logis.accounting.domain.TaxInvoiceLine;
import com.samhanair.logis.accounting.domain.TaxInvoiceStatus;
import com.samhanair.logis.accounting.repository.SupplierProfileRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceBatchExclusionRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceBatchRepository;
import com.samhanair.logis.accounting.repository.TaxInvoiceRepository;
import com.samhanair.logis.accounting.client.SlipQueryClient;
import com.samhanair.logis.accounting.web.dto.HomtaxRow;
import java.io.ByteArrayInputStream;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * HometaxExportService 단위 테스트 — BE-A11 + PR #161 흡수 회귀 검증.
 *
 * <p>커버 시나리오 5건 (기존 legacy 단순 export 회귀):
 * <ul>
 *   <li>POI workbook 생성 — sheet 1장 + 헤더</li>
 *   <li>sheet 분할 — 100건 초과 시 sheet 2개</li>
 *   <li>100건 — 정확히 100 라인 = sheet 1장 + 100 row</li>
 *   <li>홈택스 표준 컬럼 — HEADER_COLUMNS_LEGACY_12 (12 컬럼) 헤더 검증</li>
 *   <li>빈 결과 — 헤더만 sheet 1장</li>
 * </ul>
 *
 * <p>신규 의존성 (PR #161 흡수):
 * {@link SupplierProfileRepository}, {@link TaxInvoiceBatchRepository},
 * {@link TaxInvoiceBatchExclusionRepository}, {@link SlipQueryClient}, {@link ObjectMapper}
 * 는 모두 {@code @Mock} 으로 격리. SupplierProfile 미설정(empty) 시 fallback 사용.
 */
@ExtendWith(MockitoExtension.class)
class HometaxExportServiceTest {

    @Mock private TaxInvoiceRepository taxInvoiceRepository;
    @Mock private TaxInvoiceBatchRepository batchRepository;
    @Mock private TaxInvoiceBatchExclusionRepository exclusionRepository;
    @Mock private SupplierProfileRepository supplierProfileRepository;
    @Mock private SlipQueryClient slipQueryClient;
    @Mock private ObjectMapper objectMapper;

    @InjectMocks private HometaxExportService service;

    private static final LocalDate FROM = LocalDate.of(2026, 5, 1);
    private static final LocalDate TO = LocalDate.of(2026, 5, 31);

    @Test
    @DisplayName("홈택스 공급받는자 등록번호는 partnerCode가 아니라 businessNumber에서 읽는다")
    void buyerRegistrationNumberUsesBusinessNumber() {
        Map<String, Object> raw = new java.util.HashMap<>();
        raw.put("partnerCode", "P-2026-0001");
        raw.put("businessNumber", "113-07-10031");
        raw.put("partnerName", "테스트 거래처");

        HomtaxRow row = service.toHomtaxRow(raw, null);

        assertThat(row.buyerRegNo()).isEqualTo("1130710031");
        assertThat(row.buyerRegNo()).isNotEqualTo("20260001");
    }

    @Test
    @DisplayName("홈택스 공급받는자 사업자번호가 없으면 가짜 등록번호를 만들지 않는다")
    void buyerRegistrationNumberIsBlankWhenBusinessNumberMissing() {
        Map<String, Object> raw = new java.util.HashMap<>();
        raw.put("partnerCode", "P-2026-0001");
        raw.put("partnerName", "사업자번호 없음");

        HomtaxRow row = service.toHomtaxRow(raw, null);

        assertThat(row.buyerRegNo()).isBlank();
    }

    @Test
    @DisplayName("POI workbook — sheet 1장 + 헤더 + 1 라인 (fallback supplierRegNo 사용)")
    void singleSheetWithOneLine() throws Exception {
        // SupplierProfile 미설정 → fallback 사용
        when(supplierProfileRepository.findByIsPrimaryTrueAndIsDeletedFalse())
                .thenReturn(Optional.empty());

        TaxInvoice ti = newIssued("TI-001", LocalDate.of(2026, 5, 10));
        addLine(ti, "에어컨", "20평형", new BigDecimal("1"), new BigDecimal("500000"));
        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, FROM, TO))
                .thenReturn(List.of(ti));

        byte[] bytes = service.export(FROM, TO);

        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            assertThat(wb.getNumberOfSheets()).isEqualTo(1);
            Sheet sheet = wb.getSheetAt(0);
            assertThat(sheet.getRow(0).getCell(0).getStringCellValue()).isEqualTo("작성일");
            assertThat(sheet.getRow(1).getCell(4).getStringCellValue()).isEqualTo("에어컨");
            // fallback 공급자등록번호 적용 확인
            assertThat(sheet.getRow(1).getCell(1).getStringCellValue())
                    .isEqualTo(HometaxExportService.FALLBACK_REG_NO);
        }
    }

    @Test
    @DisplayName("sheet 분할 — 101 라인 입력 → sheet 2개 (100/1)")
    void sheetSplit() throws Exception {
        when(supplierProfileRepository.findByIsPrimaryTrueAndIsDeletedFalse())
                .thenReturn(Optional.empty());

        // 1개 세금계산서에 101 라인
        TaxInvoice ti = newIssued("TI-BIG", LocalDate.of(2026, 5, 15));
        for (int i = 0; i < 101; i++) {
            addLine(ti, "품목" + i, null, BigDecimal.ONE, new BigDecimal("100"));
        }
        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, FROM, TO))
                .thenReturn(List.of(ti));

        byte[] bytes = service.export(FROM, TO);

        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            assertThat(wb.getNumberOfSheets()).isEqualTo(2);
            // sheet 1: 헤더(0) + 100 row(1~100) = lastRowNum 100
            assertThat(wb.getSheetAt(0).getLastRowNum()).isEqualTo(100);
            // sheet 2: 헤더(0) + 1 row(1) = lastRowNum 1
            assertThat(wb.getSheetAt(1).getLastRowNum()).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("100건 — sheet 1장 + lastRowNum 100 (헤더 + 100 row)")
    void exactly100Lines() throws Exception {
        when(supplierProfileRepository.findByIsPrimaryTrueAndIsDeletedFalse())
                .thenReturn(Optional.empty());

        TaxInvoice ti = newIssued("TI-100", LocalDate.of(2026, 5, 20));
        for (int i = 0; i < 100; i++) {
            addLine(ti, "품목" + i, null, BigDecimal.ONE, new BigDecimal("100"));
        }
        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, FROM, TO))
                .thenReturn(List.of(ti));

        byte[] bytes = service.export(FROM, TO);

        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            assertThat(wb.getNumberOfSheets()).isEqualTo(1);
            assertThat(wb.getSheetAt(0).getLastRowNum()).isEqualTo(100);
        }
    }

    @Test
    @DisplayName("홈택스 표준 컬럼 — HEADER_COLUMNS_LEGACY_12 (12 컬럼) 헤더 정확")
    void standardColumns() throws Exception {
        when(supplierProfileRepository.findByIsPrimaryTrueAndIsDeletedFalse())
                .thenReturn(Optional.empty());
        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, FROM, TO))
                .thenReturn(List.of());

        byte[] bytes = service.export(FROM, TO);

        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            Row header = wb.getSheetAt(0).getRow(0);
            String[] expected = HometaxExportService.HEADER_COLUMNS_LEGACY_12;
            for (int i = 0; i < expected.length; i++) {
                assertThat(header.getCell(i).getStringCellValue()).isEqualTo(expected[i]);
            }
        }
    }

    @Test
    @DisplayName("빈 결과 — 헤더만 sheet 1장")
    void emptyResult() throws Exception {
        when(supplierProfileRepository.findByIsPrimaryTrueAndIsDeletedFalse())
                .thenReturn(Optional.empty());
        when(taxInvoiceRepository.findIssuedInRange(TaxInvoiceStatus.ISSUED, FROM, TO))
                .thenReturn(List.of());

        byte[] bytes = service.export(FROM, TO);

        try (Workbook wb = new XSSFWorkbook(new ByteArrayInputStream(bytes))) {
            assertThat(wb.getNumberOfSheets()).isEqualTo(1);
            assertThat(wb.getSheetAt(0).getLastRowNum()).isEqualTo(0); // 헤더만
        }
    }

    // =========================================================================
    // 보조 메서드
    // =========================================================================

    private static TaxInvoice newIssued(String taxInvoiceNo, LocalDate supplyDate) {
        UUID partnerId = UUID.randomUUID();
        TaxInvoice ti = TaxInvoice.create(partnerId, "111-22-33333", "거래처",
                "주소", supplyDate, null);
        try {
            Field idField = TaxInvoice.class.getDeclaredField("id");
            idField.setAccessible(true);
            idField.set(ti, UUID.randomUUID());
            Field noField = TaxInvoice.class.getDeclaredField("taxInvoiceNo");
            noField.setAccessible(true);
            noField.set(ti, taxInvoiceNo);
            Field statusField = TaxInvoice.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(ti, TaxInvoiceStatus.ISSUED);
            Field linesField = TaxInvoice.class.getDeclaredField("lines");
            linesField.setAccessible(true);
            linesField.set(ti, new ArrayList<TaxInvoiceLine>());
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
        return ti;
    }

    private static void addLine(TaxInvoice ti, String itemName, String spec,
                                 BigDecimal qty, BigDecimal unitPrice) {
        TaxInvoiceLine line = TaxInvoiceLine.create(ti, 1, itemName, spec, qty, unitPrice, null);
        try {
            Field linesField = TaxInvoice.class.getDeclaredField("lines");
            linesField.setAccessible(true);
            @SuppressWarnings("unchecked")
            List<TaxInvoiceLine> lines = (List<TaxInvoiceLine>) linesField.get(ti);
            lines.add(line);
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }
}
