package com.samhanair.logis.common.ecount;

import com.opencsv.CSVReader;
import com.opencsv.exceptions.CsvValidationException;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.apache.commons.io.input.BOMInputStream;

/** 이카운트 CSV import 공통 유틸리티 — MIG-1 importer 의 BOM/OpenCSV/hash 패턴을 서비스별 MIG-2 importer 에 재사용한다. */
public final class EcountCsvSupport {

    private EcountCsvSupport() {
    }

    public static byte[] readRequired(InputStream csv) {
        if (csv == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일 필수");
        }
        try {
            byte[] content = csv.readAllBytes();
            if (content.length == 0) {
                throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일이 비어 있습니다");
            }
            return content;
        } catch (IOException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 읽기 실패: " + ex.getMessage(), ex);
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
            throw new BusinessException(ErrorCode.MIG2_FILE_HASH_INVALID, "SHA-256 hash 계산 실패", ex);
        }
    }

    public static long advisoryLockKey(UUID namespace, String sourceFileHash) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            BigInteger seed = new BigInteger(1, md.digest(sourceFileHash.getBytes(StandardCharsets.UTF_8)));
            ByteBuffer buffer = ByteBuffer.allocate(16)
                    .putLong(namespace.getMostSignificantBits())
                    .putLong(namespace.getLeastSignificantBits());
            BigInteger namespaceBits = new BigInteger(1, buffer.array());
            return namespaceBits.xor(seed).longValue();
        } catch (NoSuchAlgorithmException ex) {
            throw new BusinessException(ErrorCode.MIG2_FILE_HASH_INVALID, "MD5 lock seed 계산 실패", ex);
        }
    }

    public static ParsedCsv parse(byte[] content) {
        List<String[]> rows = new ArrayList<>();
        try (BOMInputStream bomFree = BOMInputStream.builder()
                .setInputStream(new ByteArrayInputStream(content)).get();
             InputStreamReader isr = new InputStreamReader(bomFree, StandardCharsets.UTF_8);
             BufferedReader br = new BufferedReader(isr);
             CSVReader reader = new CSVReader(br)) {
            String[] row;
            while ((row = reader.readNext()) != null) {
                if (!isAllBlank(row)) {
                    rows.add(row);
                }
            }
        } catch (IOException | CsvValidationException ex) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파싱 실패: " + ex.getMessage(), ex);
        }
        if (rows.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "CSV 파일이 비어 있습니다");
        }

        int headerIndex = hasMetaRow(rows.get(0)) ? 1 : 0;
        if (rows.size() <= headerIndex) {
            throw new BusinessException(ErrorCode.MIG2_HEADER_MISMATCH, "CSV 헤더 누락");
        }
        return new ParsedCsv(headerIndex, rows.get(headerIndex), rows.subList(headerIndex + 1, rows.size()));
    }

    public static void validateHeader(String[] header, String[] expected) {
        for (int i = 0; i < expected.length; i++) {
            String actual = i < header.length ? stripCell(header[i]) : "";
            if (!expected[i].equals(actual)) {
                throw new BusinessException(ErrorCode.MIG2_HEADER_MISMATCH,
                        "CSV 헤더 형식 불일치 — 컬럼 " + (i + 1)
                                + " 예상='" + expected[i] + "' 실제='" + actual + "'");
            }
        }
    }

    public static String[] normalizeRow(String[] raw, int width) {
        String[] out = new String[width];
        for (int i = 0; i < width; i++) {
            out[i] = i < raw.length ? stripCell(raw[i]) : "";
        }
        return out;
    }

    public static boolean isAllBlank(String[] row) {
        for (String c : row) {
            if (c != null && !stripCell(c).isEmpty()) {
                return false;
            }
        }
        return true;
    }

    public static String stripCell(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.replace("\t", "").strip();
    }

    public static String nullIfBlank(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static boolean hasMetaRow(String[] row) {
        return row.length > 0 && stripCell(row[0]).startsWith("데이터관리>");
    }

    public record ParsedCsv(int headerIndex, String[] header, List<String[]> dataRows) {
    }
}
