package com.samhanair.logis.accounting.service;

import com.samhanair.logis.common.ecount.EcountCsvSupport;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** MIG-3 회계 전표 CSV import 공통 정규화 helper. */
final class EcountVoucherImportSupport {

    static final Pattern PLACEHOLDER = Pattern.compile("^(-|0+|0+[- ]?0+[- ]?0+)$");
    private static final Pattern VOUCHER_NO =
            Pattern.compile("^(\\d{4})/(\\d{2})/(\\d{2})\\s*-\\s*(\\d+)$");
    private static final Pattern JOURNAL_ENTRY_NO =
            Pattern.compile("^(\\d{4})/(\\d{2})/(\\d{2})\\s*-\\s*(\\d+)\\s*-\\s*(\\d+)$");

    private EcountVoucherImportSupport() {
    }

    static void validateHeader(String[] actual, String[] expected) {
        try {
            EcountCsvSupport.validateHeader(actual, expected);
        } catch (BusinessException ex) {
            throw new BusinessException(ErrorCode.MIG3_CSV_HEADER_MISMATCH, ex.getMessage(), ex);
        }
    }

    static String normalizeVoucherNo(String raw, int rowNo) {
        String value = EcountCsvSupport.stripCell(raw);
        Matcher matcher = VOUCHER_NO.matcher(value);
        if (!matcher.matches()) {
            throw new BusinessException(ErrorCode.MIG3_VOUCHER_NO_INVALID,
                    "전표번호 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + value + "'");
        }
        return matcher.group(1) + matcher.group(2) + matcher.group(3) + "-" + matcher.group(4);
    }

    static LocalDate parseVoucherDate(String raw, int rowNo) {
        String value = EcountCsvSupport.stripCell(raw);
        Matcher matcher = VOUCHER_NO.matcher(value);
        if (!matcher.matches()) {
            throw new BusinessException(ErrorCode.MIG3_VOUCHER_NO_INVALID,
                    "전표일자 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + value + "'");
        }
        return parseDate(matcher, rowNo, value);
    }

    static JournalEntryKey parseJournalEntryKey(String raw, int rowNo) {
        String value = EcountCsvSupport.stripCell(raw);
        Matcher matcher = JOURNAL_ENTRY_NO.matcher(value);
        if (!matcher.matches()) {
            throw new BusinessException(ErrorCode.MIG3_VOUCHER_NO_INVALID,
                    "일자-No-순번 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + value + "'");
        }
        LocalDate date = parseDate(matcher, rowNo, value);
        String journalNo = matcher.group(1) + matcher.group(2) + matcher.group(3) + "-" + matcher.group(4);
        int lineSequence = Integer.parseInt(matcher.group(5));
        return new JournalEntryKey(date, journalNo, lineSequence);
    }

    static BigDecimal parsePositiveAmount(String raw, int rowNo) {
        BigDecimal amount = parseAmount(raw, rowNo);
        if (amount.signum() <= 0) {
            throw new BusinessException(ErrorCode.MIG3_SLIP_AMOUNT_INVALID,
                    "전표 금액은 0보다 커야 합니다: sourceRowNo=" + rowNo + ", sample='" + raw + "'");
        }
        return amount;
    }

    static BigDecimal parseAmount(String raw, int rowNo) {
        String value = EcountCsvSupport.stripCell(raw).replace(",", "");
        if (value.isBlank() || PLACEHOLDER.matcher(value).matches()) {
            return BigDecimal.ZERO;
        }
        try {
            return new BigDecimal(value);
        } catch (NumberFormatException ex) {
            throw new BusinessException(ErrorCode.MIG3_SLIP_AMOUNT_INVALID,
                    "금액 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + raw + "'", ex);
        }
    }

    static boolean isBlankOrPlaceholder(String value) {
        String stripped = EcountCsvSupport.stripCell(value);
        return stripped.isBlank() || PLACEHOLDER.matcher(stripped).matches();
    }

    private static LocalDate parseDate(Matcher matcher, int rowNo, String sample) {
        try {
            return LocalDate.of(
                    Integer.parseInt(matcher.group(1)),
                    Integer.parseInt(matcher.group(2)),
                    Integer.parseInt(matcher.group(3)));
        } catch (DateTimeException ex) {
            throw new BusinessException(ErrorCode.MIG3_VOUCHER_NO_INVALID,
                    "전표일자 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + sample + "'", ex);
        }
    }

    static String actor(String actorUserId) {
        return actorUserId == null || actorUserId.isBlank() ? "system" : actorUserId;
    }

    record JournalEntryKey(LocalDate journalDate, String journalNo, int lineSequence) {
    }
}
