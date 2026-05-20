package com.samhanair.logis.common.ecount;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.math.BigDecimal;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** MIG-5 이카운트 CSV import 공통 정규화 helper. */
public final class EcountMig5ImportSupport {

    private static final Pattern SLIP_NO =
            Pattern.compile("^(\\d{4})/(\\d{2})/(\\d{2})\\s*-\\s*(\\d+)$");

    private EcountMig5ImportSupport() {
    }

    public static void validateHeader(String[] actual, String[] expected) {
        try {
            EcountCsvSupport.validateHeader(actual, expected);
        } catch (BusinessException ex) {
            throw new BusinessException(ErrorCode.MIG5_CSV_HEADER_MISMATCH, ex.getMessage(), ex);
        }
    }

    public static SlipKey parseSlipKey(String raw, int rowNo) {
        String value = EcountCsvSupport.stripCell(raw);
        Matcher matcher = SLIP_NO.matcher(value);
        if (!matcher.matches()) {
            throw new BusinessException(ErrorCode.MIG5_DATE_INVALID,
                    "일자-No. 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + value + "'");
        }
        LocalDate date = parseDate(matcher.group(1), matcher.group(2), matcher.group(3), rowNo, value);
        int sequence = Integer.parseInt(matcher.group(4));
        return new SlipKey(date, "%04d-%02d-%02d-%03d".formatted(
                date.getYear(), date.getMonthValue(), date.getDayOfMonth(), sequence));
    }

    public static BigDecimal parseAmount(String raw, int rowNo, boolean blankAllowed) {
        String value = EcountCsvSupport.stripCell(raw).replace(",", "");
        if (value.isBlank()) {
            return blankAllowed ? null : BigDecimal.ZERO;
        }
        try {
            BigDecimal amount = new BigDecimal(value);
            if (amount.signum() < 0) {
                throw new NumberFormatException("negative");
            }
            return amount;
        } catch (NumberFormatException ex) {
            throw new BusinessException(ErrorCode.MIG5_AMOUNT_INVALID,
                    "금액 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + raw + "'", ex);
        }
    }

    public static int parsePositiveQuantity(String raw, int rowNo) {
        BigDecimal amount = parseAmount(raw, rowNo, false);
        if (amount == null || amount.stripTrailingZeros().scale() > 0 || amount.signum() <= 0) {
            throw new BusinessException(ErrorCode.MIG5_AMOUNT_INVALID,
                    "수량은 양의 정수여야 합니다: sourceRowNo=" + rowNo + ", sample='" + raw + "'");
        }
        return amount.intValueExact();
    }

    public static boolean isBlankFooterRow(String[] row) {
        return Arrays.stream(row)
                .allMatch(c -> c == null || EcountCsvSupport.stripCell(c).trim().isEmpty());
    }

    public static String actor(String actorUserId) {
        return actorUserId == null || actorUserId.isBlank() ? "system" : actorUserId;
    }

    private static LocalDate parseDate(String y, String m, String d, int rowNo, String sample) {
        try {
            return LocalDate.of(Integer.parseInt(y), Integer.parseInt(m), Integer.parseInt(d));
        } catch (DateTimeException ex) {
            throw new BusinessException(ErrorCode.MIG5_DATE_INVALID,
                    "일자 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + sample + "'", ex);
        }
    }

    public record SlipKey(LocalDate date, String canonicalNo) {
    }
}
