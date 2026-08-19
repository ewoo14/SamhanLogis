package com.samhanair.logis.inventory.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;

/**
 * DPS 입고 엑셀 (.xlsx) 파서 — PR-E1 BE-2.
 *
 * <p>legacy GAS 1번/16번 의 DPS 엑셀 헤더 row (1행) + data row (2행 ~) 구조를 가정. 헤더 컬럼명은
 * {@link #HEADER_PRODUCT_CODE} 등 한국어 5종 keyword 로 자동 매칭 — 컬럼 순서가 달라도 동작.
 *
 * <p>BOM (UTF-8 BOM) 은 {@link XSSFWorkbook} 가 자동 처리 (binary 포맷이라 BOM 영향 없음).
 * .xls (구 binary) 는 본 슬라이스 미지원 — InvalidFormatException 발생 시 BusinessException 매핑.
 *
 * <p>스킵 정책:
 * <ul>
 *   <li>품번이 빈 row → 스킵 (헤더 아래 비어있는 라인 허용)</li>
 *   <li>수량이 0 또는 음수 → 그대로 보존 (매칭 알고리즘이 mismatch 로 분류)</li>
 *   <li>날짜 cell 이 비어있거나 형식 불명 → null 보존</li>
 * </ul>
 */
@Component
public class DpsExcelParser {

    /** DPS 엑셀의 5종 컬럼 헤더 keyword (한국어 자유 표기 허용 — contains 매칭). */
    public static final String HEADER_PRODUCT_CODE = "품번";
    public static final String HEADER_INBOUND_DATE = "입고일자";
    public static final String HEADER_QUANTITY = "수량";
    public static final String HEADER_PARTNER_CODE = "거래처코드";
    public static final String HEADER_PARTNER_NAME = "거래처";
    public static final String HEADER_DELIVERY_NO = "납품번호";
    public static final String HEADER_MODEL = "모델";
    public static final String HEADER_TOTAL = "합계";

    /**
     * .xlsx 입력 stream → DPS row 목록.
     *
     * @param input .xlsx 바이너리 stream (호출자가 close 책임)
     * @return DPS row 목록 (빈 row / 헤더 row 제외)
     * @throws BusinessException(INVALID_INPUT) 헤더 row 인식 불가, 형식 오류, 필수 컬럼 누락
     */
    public List<DpsExcelRow> parse(InputStream input) {
        if (input == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "DPS 엑셀 stream 이 비어있습니다");
        }

        try (Workbook workbook = new XSSFWorkbook(input)) {
            if (workbook.getNumberOfSheets() == 0) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "DPS 엑셀에 시트가 없습니다");
            }
            Sheet sheet = workbook.getSheetAt(0);

            Row headerRow = findHeaderRow(sheet);
            if (headerRow == null) {
                throw new BusinessException(ErrorCode.INVALID_INPUT,
                        "DPS 엑셀의 헤더 row 가 없습니다");
            }
            Map<String, Integer> headerIndex = mapHeaders(headerRow);
            boolean actualDps = headerIndex.containsKey(HEADER_DELIVERY_NO)
                    && headerIndex.containsKey(HEADER_MODEL)
                    && headerIndex.containsKey(HEADER_TOTAL);
            if (actualDps) {
                requireHeader(headerIndex, HEADER_DELIVERY_NO);
                requireHeader(headerIndex, HEADER_MODEL);
            } else {
                requireHeader(headerIndex, HEADER_PRODUCT_CODE);
            }
            requireHeader(headerIndex, HEADER_QUANTITY);

            List<DpsExcelRow> rows = new ArrayList<>();
            int firstDataRow = headerRow.getRowNum() + 1;
            int lastRow = sheet.getLastRowNum();
            for (int r = firstDataRow; r <= lastRow; r++) {
                Row dataRow = sheet.getRow(r);
                if (dataRow == null) {
                    continue;
                }
                String productCode = readString(dataRow, actualDps
                        ? headerIndex.get(HEADER_MODEL) : headerIndex.get(HEADER_PRODUCT_CODE));
                if (productCode == null || productCode.isBlank()) {
                    continue; // 빈 row 스킵 (헤더 아래 trailing 빈 라인 허용)
                }
                int quantity = readInt(dataRow, headerIndex.get(HEADER_QUANTITY));
                LocalDate inboundDate = readDate(dataRow, headerIndex.get(HEADER_INBOUND_DATE));
                String partnerCode = readString(dataRow, headerIndex.get(HEADER_PARTNER_CODE));
                String partnerName = readString(dataRow, headerIndex.get(HEADER_PARTNER_NAME));
                String deliveryNo = readString(dataRow, headerIndex.get(HEADER_DELIVERY_NO));
                BigDecimal totalAmount = readDecimal(dataRow, headerIndex.get(HEADER_TOTAL));

                rows.add(new DpsExcelRow(deliveryNo == null ? null : deliveryNo.trim(),
                        productCode.trim(), inboundDate, quantity,
                        partnerCode == null ? null : partnerCode.trim(),
                        partnerName == null ? null : partnerName.trim(), totalAmount));
            }
            return rows;
        } catch (BusinessException ex) {
            throw ex;
        } catch (IOException | RuntimeException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "DPS 엑셀 파싱 실패: " + ex.getMessage(), ex);
        }
    }

    private Map<String, Integer> mapHeaders(Row headerRow) {
        Map<String, Integer> index = new HashMap<>();
        for (int c = headerRow.getFirstCellNum(); c < headerRow.getLastCellNum(); c++) {
            Cell cell = headerRow.getCell(c);
            if (cell == null) {
                continue;
            }
            String name = readCellAsString(cell);
            if (name == null || name.isBlank()) {
                continue;
            }
            String normalized = name.trim().replaceAll("\\s+", "");
            // contains 매칭 — 헤더가 "거래처코드", "거래처 코드", "거래처_코드" 등 자유 표기 허용
            if (normalized.contains(HEADER_PRODUCT_CODE)) {
                index.putIfAbsent(HEADER_PRODUCT_CODE, c);
            }
            if (normalized.contains(HEADER_DELIVERY_NO)) index.putIfAbsent(HEADER_DELIVERY_NO, c);
            if (normalized.equals(HEADER_MODEL)) index.putIfAbsent(HEADER_MODEL, c);
            if (normalized.equals(HEADER_TOTAL) || normalized.equals("합계금액")) {
                index.putIfAbsent(HEADER_TOTAL, c);
            }
            if (normalized.contains(HEADER_INBOUND_DATE)) {
                index.putIfAbsent(HEADER_INBOUND_DATE, c);
            }
            if (normalized.contains("납품일자")) index.putIfAbsent(HEADER_INBOUND_DATE, c);
            if (normalized.contains(HEADER_PARTNER_CODE)) {
                index.putIfAbsent(HEADER_PARTNER_CODE, c);
            } else if (normalized.contains(HEADER_PARTNER_NAME)
                    && !index.containsKey(HEADER_PARTNER_NAME)) {
                // "거래처" 단독 헤더 → 거래처명으로 인식
                index.put(HEADER_PARTNER_NAME, c);
            }
            // 수량 컬럼 — "입고수량" / "수량" / "Qty" 모두 매칭
            if (normalized.contains(HEADER_QUANTITY)
                    || normalized.toLowerCase(Locale.ROOT).contains("qty")) {
                index.putIfAbsent(HEADER_QUANTITY, c);
            }
        }
        return index;
    }

    private Row findHeaderRow(Sheet sheet) {
        for (int r = sheet.getFirstRowNum(); r <= sheet.getLastRowNum(); r++) {
            Row row = sheet.getRow(r);
            if (row == null) continue;
            Map<String, Integer> headers = mapHeaders(row);
            if ((headers.containsKey(HEADER_PRODUCT_CODE) || headers.containsKey(HEADER_MODEL))
                    && headers.containsKey(HEADER_QUANTITY)) return row;
        }
        throw new BusinessException(ErrorCode.INVALID_INPUT, "DPS 엑셀의 헤더 row 를 찾을 수 없습니다");
    }

    private void requireHeader(Map<String, Integer> headerIndex, String headerName) {
        if (!headerIndex.containsKey(headerName)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "DPS 엑셀에 필수 헤더가 없습니다: " + headerName);
        }
    }

    private String readString(Row row, Integer columnIndex) {
        if (columnIndex == null) {
            return null;
        }
        Cell cell = row.getCell(columnIndex);
        return cell == null ? null : readCellAsString(cell);
    }

    private int readInt(Row row, Integer columnIndex) {
        if (columnIndex == null) {
            return 0;
        }
        Cell cell = row.getCell(columnIndex);
        if (cell == null) {
            return 0;
        }
        if (cell.getCellType() == CellType.NUMERIC) {
            return (int) Math.round(cell.getNumericCellValue());
        }
        String s = readCellAsString(cell);
        if (s == null || s.isBlank()) {
            return 0;
        }
        try {
            return Integer.parseInt(s.trim().replace(",", ""));
        } catch (NumberFormatException ex) {
            return 0;
        }
    }

    private BigDecimal readDecimal(Row row, Integer columnIndex) {
        if (columnIndex == null || row.getCell(columnIndex) == null) return BigDecimal.ZERO;
        String value = readCellAsString(row.getCell(columnIndex));
        if (value == null || value.isBlank()) return BigDecimal.ZERO;
        try {
            return new BigDecimal(value.trim().replace(",", ""));
        } catch (NumberFormatException ex) {
            return BigDecimal.ZERO;
        }
    }

    private LocalDate readDate(Row row, Integer columnIndex) {
        if (columnIndex == null) {
            return null;
        }
        Cell cell = row.getCell(columnIndex);
        if (cell == null) {
            return null;
        }
        if (cell.getCellType() == CellType.NUMERIC && DateUtil.isCellDateFormatted(cell)) {
            return cell.getDateCellValue().toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
        }
        String s = readCellAsString(cell);
        if (s == null || s.isBlank()) {
            return null;
        }
        // 자유 형식 — 본 슬라이스에서는 일반 ISO yyyy-MM-dd 만 시도, 실패 시 null
        try {
            return LocalDate.parse(s.trim().replace("/", "-"));
        } catch (RuntimeException ex) {
            return null;
        }
    }

    private String readCellAsString(Cell cell) {
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> {
                if (DateUtil.isCellDateFormatted(cell)) {
                    yield cell.getDateCellValue().toString();
                }
                double d = cell.getNumericCellValue();
                if (d == Math.floor(d)) {
                    yield String.valueOf((long) d);
                }
                yield String.valueOf(d);
            }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> cell.getCellFormula();
            case BLANK, _NONE, ERROR -> null;
        };
    }
}
