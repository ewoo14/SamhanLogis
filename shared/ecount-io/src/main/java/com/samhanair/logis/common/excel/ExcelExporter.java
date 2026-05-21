package com.samhanair.logis.common.excel;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.DataFormat;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.HorizontalAlignment;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.VerticalAlignment;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

/**
 * Apache POI 기반 Excel (.xlsx) 생성기 — SamhanLogis P1-6 공통 Excel export.
 *
 * <p>모든 list 화면 (거래처 / 슬립 / 분개 / 재고) 의 Excel 다운로드를 단일 유틸리티로 통합.
 * 본 클래스는 {@code @Component} 없이 순수 static 유틸리티로 제공되므로
 * 각 서비스에서 {@code new ExcelExporter()} 또는 정적 메서드로 호출 가능.
 *
 * <h3>스타일 규약</h3>
 * <ul>
 *   <li>헤더 행 — 파란 배경 (#4472C4), 흰색 굵은 폰트, 가운데 정렬</li>
 *   <li>데이터 행 — 흰/연회색 교번, 얇은 테두리</li>
 *   <li>금액/수량 컬럼 ({@link ExcelColumn#numericFormat()} = true) — 천 단위 콤마, 우측 정렬</li>
 *   <li>날짜 ({@link LocalDate} / {@link LocalDateTime}) — {@code yyyy-MM-dd} 포맷</li>
 *   <li>UUID — 사용자 노출 금지 가드 (memory feedback_uuid_no_user_visibility),
 *       row 조립 시 코드/이름 필드만 사용할 것 (ExcelExporter 자체는 값을 검증하지 않음)</li>
 * </ul>
 *
 * <h3>사용 예시</h3>
 * <pre>{@code
 * byte[] xlsx = ExcelExporter.export(request);
 * return ResponseEntity.ok()
 *     .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=partners.xlsx")
 *     .contentType(MediaType.parseMediaType(
 *         "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
 *     .body(xlsx);
 * }</pre>
 */
public class ExcelExporter {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter DATETIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    /** 헤더 배경색 (파란 계열, MS Office 기본 테마 강조 1). */
    private static final short HEADER_BG = IndexedColors.ROYAL_BLUE.getIndex();
    /** 짝수 행 배경색 (연회색). */
    private static final short STRIPE_BG = IndexedColors.GREY_25_PERCENT.getIndex();

    /** 인스턴스화 금지 — 순수 static 유틸리티. */
    private ExcelExporter() {
    }

    /**
     * {@link ExcelExportRequest} 를 .xlsx 바이트 배열로 변환.
     *
     * <p>내부적으로 XSSFWorkbook 을 생성하고 메모리에 직렬화한 후 반환.
     * 대용량(10만 행 이상) 은 SXSSFWorkbook 으로 전환 필요 — 현 P1-6 요구사항은 최대 수천 행 수준.
     *
     * @param request 시트이름 / 컬럼 / 행 데이터
     * @return xlsx 바이트 배열 (HTTP 응답 body 로 직접 사용 가능)
     * @throws UncheckedIOException POI 직렬화 실패 시
     */
    public static byte[] export(ExcelExportRequest request) {
        try (Workbook wb = new XSSFWorkbook();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {

            Sheet sheet = wb.createSheet(safeSheetName(request.sheetName()));

            // 셀 스타일 생성
            CellStyle headerStyle = buildHeaderStyle(wb);
            CellStyle textStyle = buildTextStyle(wb, false);
            CellStyle stripeStyle = buildStripeStyle(wb, false);
            CellStyle numStyle = buildTextStyle(wb, true);
            CellStyle numStripeStyle = buildStripeStyle(wb, true);

            // 헤더 행 (row 0)
            List<ExcelColumn> cols = request.columns();
            Row headerRow = sheet.createRow(0);
            headerRow.setHeightInPoints(18);
            for (int i = 0; i < cols.size(); i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(cols.get(i).header());
                cell.setCellStyle(headerStyle);
                sheet.setColumnWidth(i, cols.get(i).width());
            }

            // 데이터 행 (row 1+)
            List<Map<String, Object>> rows = request.rows();
            for (int r = 0; r < rows.size(); r++) {
                Row row = sheet.createRow(r + 1);
                boolean stripe = (r % 2 == 1);
                Map<String, Object> data = rows.get(r);

                for (int c = 0; c < cols.size(); c++) {
                    ExcelColumn col = cols.get(c);
                    Cell cell = row.createCell(c);
                    Object val = data.get(col.dataKey());

                    if (col.numericFormat()) {
                        applyNumericCell(cell, val, stripe ? numStripeStyle : numStyle);
                    } else {
                        cell.setCellValue(toStringValue(val));
                        cell.setCellStyle(stripe ? stripeStyle : textStyle);
                    }
                }
            }

            wb.write(out);
            return out.toByteArray();

        } catch (IOException e) {
            throw new UncheckedIOException("Excel 생성 실패", e);
        }
    }

    // ----------------------------------------------------------------
    // 내부 헬퍼
    // ----------------------------------------------------------------

    /** 시트 이름은 최대 31자, Excel 예약 문자 제거. */
    private static String safeSheetName(String name) {
        if (name == null) {
            return "Sheet1";
        }
        String safe = name.replaceAll("[/\\\\*\\[\\]?:]", "");
        return safe.length() > 31 ? safe.substring(0, 31) : safe;
    }

    /** 값을 표시 문자열로 변환 (null → ""). */
    private static String toStringValue(Object val) {
        if (val == null) {
            return "";
        }
        if (val instanceof LocalDate ld) {
            return ld.format(DATE_FMT);
        }
        if (val instanceof LocalDateTime ldt) {
            return ldt.format(DATETIME_FMT);
        }
        return val.toString();
    }

    /** 숫자 셀 설정 — BigDecimal / Number 는 numeric, 나머지는 문자열 fallback. */
    private static void applyNumericCell(Cell cell, Object val, CellStyle style) {
        if (val instanceof BigDecimal bd) {
            cell.setCellValue(bd.doubleValue());
        } else if (val instanceof Number n) {
            cell.setCellValue(n.doubleValue());
        } else {
            cell.setCellValue(toStringValue(val));
        }
        cell.setCellStyle(style);
    }

    // ----------------------------------------------------------------
    // 스타일 팩토리
    // ----------------------------------------------------------------

    private static CellStyle buildHeaderStyle(Workbook wb) {
        Font font = wb.createFont();
        font.setBold(true);
        font.setColor(IndexedColors.WHITE.getIndex());
        font.setFontHeightInPoints((short) 11);

        CellStyle style = wb.createCellStyle();
        style.setFont(font);
        style.setFillForegroundColor(HEADER_BG);
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        applyThinBorder(style);
        return style;
    }

    private static CellStyle buildTextStyle(Workbook wb, boolean numeric) {
        CellStyle style = wb.createCellStyle();
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        if (numeric) {
            style.setAlignment(HorizontalAlignment.RIGHT);
            applyNumericFormat(wb, style);
        } else {
            style.setAlignment(HorizontalAlignment.LEFT);
        }
        applyThinBorder(style);
        return style;
    }

    private static CellStyle buildStripeStyle(Workbook wb, boolean numeric) {
        CellStyle style = buildTextStyle(wb, numeric);
        style.setFillForegroundColor(STRIPE_BG);
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        return style;
    }

    private static void applyNumericFormat(Workbook wb, CellStyle style) {
        DataFormat fmt = wb.createDataFormat();
        style.setDataFormat(fmt.getFormat("#,##0"));
    }

    private static void applyThinBorder(CellStyle style) {
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
    }
}
