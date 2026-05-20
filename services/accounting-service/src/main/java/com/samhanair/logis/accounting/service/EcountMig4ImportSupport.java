package com.samhanair.logis.accounting.service;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** MIG-4 이카운트 영업·세무 CSV import 공통 정규화 helper. */
final class EcountMig4ImportSupport {

    private static final Pattern SLIP_NO =
            Pattern.compile("^(\\d{4})/(\\d{2})/(\\d{2})\\s*-\\s*(\\d+)$");

    private EcountMig4ImportSupport() {
    }

    static void validateHeader(String[] actual, String[] expected) {
        try {
            EcountCsvSupport.validateHeader(actual, expected);
        } catch (BusinessException ex) {
            throw new BusinessException(ErrorCode.MIG4_CSV_HEADER_MISMATCH, ex.getMessage(), ex);
        }
    }

    static SlipKey parseSlipKey(String raw, int rowNo) {
        String value = EcountCsvSupport.stripCell(raw);
        Matcher matcher = SLIP_NO.matcher(value);
        if (!matcher.matches()) {
            throw new BusinessException(ErrorCode.MIG4_SLIP_NO_INVALID,
                    "일자-No. 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + value + "'");
        }
        LocalDate date = parseDate(matcher.group(1), matcher.group(2), matcher.group(3), rowNo, value);
        int sequence = Integer.parseInt(matcher.group(4));
        return new SlipKey(date, "%04d-%02d-%02d-%03d".formatted(
                date.getYear(), date.getMonthValue(), date.getDayOfMonth(), sequence),
                "%04d%02d%02d-%d".formatted(
                        date.getYear(), date.getMonthValue(), date.getDayOfMonth(), sequence));
    }

    static LocalDate parseDate(String raw, int rowNo) {
        String value = EcountCsvSupport.stripCell(raw);
        Matcher matcher = Pattern.compile("^(\\d{4})/(\\d{2})/(\\d{2}).*$").matcher(value);
        if (!matcher.matches()) {
            throw new BusinessException(ErrorCode.MIG4_DATE_INVALID,
                    "일자 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + value + "'");
        }
        return parseDate(matcher.group(1), matcher.group(2), matcher.group(3), rowNo, value);
    }

    static LocalDate parseOptionalDate(String raw, int rowNo) {
        if (EcountCsvSupport.stripCell(raw).isBlank()) {
            return null;
        }
        return parseDate(raw, rowNo);
    }

    static LocalDate parseDueDate(String mmdd, LocalDate baseDate, int rowNo) {
        String value = EcountCsvSupport.stripCell(mmdd);
        if (value.isBlank()) {
            return null;
        }
        if (!value.matches("^\\d{4}$")) {
            throw new BusinessException(ErrorCode.MIG4_DATE_INVALID,
                    "입금예정일 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + value + "'");
        }
        try {
            return LocalDate.of(baseDate.getYear(),
                    Integer.parseInt(value.substring(0, 2)),
                    Integer.parseInt(value.substring(2, 4)));
        } catch (DateTimeException ex) {
            throw new BusinessException(ErrorCode.MIG4_DATE_INVALID,
                    "입금예정일 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + value + "'", ex);
        }
    }

    static BigDecimal parsePositiveAmount(String raw, int rowNo) {
        BigDecimal amount = parseAmount(raw, rowNo);
        if (amount.signum() <= 0) {
            throw new BusinessException(ErrorCode.MIG4_AMOUNT_INVALID,
                    "금액은 0보다 커야 합니다: sourceRowNo=" + rowNo + ", sample='" + raw + "'");
        }
        return amount;
    }

    static BigDecimal parseAmount(String raw, int rowNo) {
        String value = EcountCsvSupport.stripCell(raw).replace(",", "");
        if (value.isBlank()) {
            return BigDecimal.ZERO;
        }
        try {
            BigDecimal amount = new BigDecimal(value);
            if (amount.signum() < 0) {
                throw new NumberFormatException("negative");
            }
            return amount;
        } catch (NumberFormatException ex) {
            throw new BusinessException(ErrorCode.MIG4_AMOUNT_INVALID,
                    "금액 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + raw + "'", ex);
        }
    }

    static String actor(String actorUserId) {
        return actorUserId == null || actorUserId.isBlank() ? "system" : actorUserId;
    }

    private static LocalDate parseDate(String y, String m, String d, int rowNo, String sample) {
        try {
            return LocalDate.of(Integer.parseInt(y), Integer.parseInt(m), Integer.parseInt(d));
        } catch (DateTimeException ex) {
            throw new BusinessException(ErrorCode.MIG4_DATE_INVALID,
                    "일자 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + sample + "'", ex);
        }
    }

    record SlipKey(LocalDate date, String canonicalSlipNo, String legacySlipNo) {
    }
}
