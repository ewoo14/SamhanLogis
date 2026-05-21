package com.samhanair.logis.common.ecount.io;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

/** 이카운트 XLSX import 공통 유틸리티 — sheet 0, strict header, SHA-256 hash. */
public final class EcountXlsxSupport {

    private EcountXlsxSupport() {
    }

    public static ParsedXlsx parse(InputStream xlsxStream, String[] expectedHeaders) {
        byte[] content = readRequired(xlsxStream);
        String hash = computeFileHash(content);
        try (Workbook workbook = new XSSFWorkbook(new ByteArrayInputStream(content))) {
            Sheet sheet = workbook.getSheetAt(0);
            DataFormatter formatter = new DataFormatter(Locale.KOREA);
            int headerIndex = headerIndex(sheet, formatter);
            Row headerRow = sheet.getRow(headerIndex);
            String[] header = readRow(headerRow, expectedHeaders.length, formatter);
            validateHeader(headerRow, header, expectedHeaders, formatter);

            List<ParsedRow> rows = new ArrayList<>();
            for (int rowIndex = headerIndex + 1; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
                String[] cells = readRow(sheet.getRow(rowIndex), expectedHeaders.length, formatter);
                if (isAllBlank(cells) || isFooterRow(cells)) {
                    continue;
                }
                Map<String, String> values = new LinkedHashMap<>();
                for (int i = 0; i < expectedHeaders.length; i++) {
                    values.put(expectedHeaders[i], cells[i]);
                }
                rows.add(new ParsedRow(rowIndex + 1, values, cells));
            }
            return new ParsedXlsx(headerIndex + 1, header, rows, hash, rows.size());
        } catch (BusinessException ex) {
            throw ex;
        } catch (IOException | RuntimeException ex) {
            throw new BusinessException(ErrorCode.MIG11_XLSX_PARSE_FAILED,
                    "XLSX 파싱 실패: " + ex.getMessage(), ex);
        }
    }

    public static byte[] readRequired(InputStream xlsxStream) {
        if (xlsxStream == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "XLSX 파일 필수");
        }
        try {
            byte[] content = xlsxStream.readAllBytes();
            if (content.length == 0) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "XLSX 파일이 비어 있습니다");
            }
            return content;
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "XLSX 읽기 실패: " + ex.getMessage(), ex);
        }
    }

    public static String computeFileHash(byte[] content) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(content);
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(String.format("%02X", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new BusinessException(ErrorCode.MIG11_FILE_HASH_INVALID, "SHA-256 hash 계산 실패", ex);
        }
    }

    private static int headerIndex(Sheet sheet, DataFormatter formatter) {
        Row first = sheet.getRow(0);
        String firstCell = first == null ? "" : stripCell(formatter.formatCellValue(first.getCell(0)));
        if (firstCell.startsWith("회사명 :") || firstCell.startsWith("회사명:")) {
            return 1;
        }
        return 0;
    }

    private static String[] readRow(Row row, int width, DataFormatter formatter) {
        String[] values = new String[width];
        Arrays.fill(values, "");
        if (row == null) {
            return values;
        }
        for (int i = 0; i < width; i++) {
            Cell cell = row.getCell(i, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
            values[i] = cell == null ? "" : stripCell(formatter.formatCellValue(cell));
        }
        return values;
    }

    private static void validateHeader(Row headerRow, String[] actual, String[] expected, DataFormatter formatter) {
        int nonBlankCount = countNonBlankCells(headerRow, formatter);
        if (nonBlankCount > expected.length) {
            throw new BusinessException(ErrorCode.MIG11_HEADER_MISMATCH,
                    "Unexpected extra columns: expected=" + expected.length + ", got=" + nonBlankCount);
        }
        if (actual.length != expected.length) {
            throw new BusinessException(ErrorCode.MIG11_HEADER_MISMATCH,
                    "XLSX 헤더 컬럼 수 불일치 — 예상=" + expected.length + " 실제=" + actual.length);
        }
        for (int i = 0; i < expected.length; i++) {
            if (!expected[i].equals(actual[i])) {
                throw new BusinessException(ErrorCode.MIG11_HEADER_MISMATCH,
                        "XLSX 헤더 형식 불일치 — 컬럼 " + (i + 1)
                                + " 예상='" + expected[i] + "' 실제='" + actual[i] + "'");
            }
        }
    }

    private static int countNonBlankCells(Row row, DataFormatter formatter) {
        if (row == null || row.getLastCellNum() < 0) {
            return 0;
        }
        int count = 0;
        for (int i = 0; i < row.getLastCellNum(); i++) {
            Cell cell = row.getCell(i, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
            if (cell != null && !stripCell(formatter.formatCellValue(cell)).isEmpty()) {
                count = i + 1;
            }
        }
        return count;
    }

    public static boolean isAllBlank(String[] row) {
        for (String cell : row) {
            if (cell != null && !stripCell(cell).isEmpty()) {
                return false;
            }
        }
        return true;
    }

    private static boolean isFooterRow(String[] row) {
        if (row.length == 0) {
            return false;
        }
        String first = stripCell(row[0]);
        if (!"합계".equals(first) && !"총계".equals(first)) {
            return false;
        }
        for (int i = 1; i < row.length; i++) {
            if (!isBlankOrNumeric(row[i])) {
                return false;
            }
        }
        return true;
    }

    private static boolean isBlankOrNumeric(String raw) {
        String value = stripCell(raw).replace(",", "");
        if (value.isBlank()) {
            return true;
        }
        try {
            new java.math.BigDecimal(value);
            return true;
        } catch (NumberFormatException ex) {
            return false;
        }
    }

    public static String stripCell(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.replace("\t", "").replace("\u00A0", " ").strip();
    }

    public static String nullIfBlank(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    public record ParsedXlsx(int headerRowNo, String[] header, List<ParsedRow> rows,
                             String sourceFileHash, int dataRowCount) {
    }

    public record ParsedRow(int sourceRowNo, Map<String, String> values, String[] cells) {
        public String get(String header) {
            return values.getOrDefault(header, "");
        }
    }
}
