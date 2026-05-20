package com.samhanair.logis.common.ecount;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.time.DateTimeException;
import java.time.LocalDate;

/** MIG-6 이카운트 마스터 CSV import 공통 정규화 helper. */
public final class EcountMig6ImportSupport {

    private EcountMig6ImportSupport() {
    }

    public static void validateHeader(String[] actual, String[] expected) {
        try {
            EcountCsvSupport.validateHeader(actual, expected);
        } catch (BusinessException ex) {
            throw new BusinessException(ErrorCode.MIG6_CSV_HEADER_MISMATCH, ex.getMessage(), ex);
        }
    }

    public static String actor(String actorUserId) {
        return actorUserId == null || actorUserId.isBlank() ? "system" : actorUserId;
    }

    public static boolean parseActiveFlag(String raw, int rowNo) {
        String value = EcountCsvSupport.stripCell(raw);
        if (value.equalsIgnoreCase("YES") || value.equalsIgnoreCase("Y") || value.equalsIgnoreCase("Yes")) {
            return true;
        }
        if (value.equalsIgnoreCase("NO") || value.equalsIgnoreCase("N") || value.equalsIgnoreCase("No")) {
            return false;
        }
        throw new BusinessException(ErrorCode.MIG6_BOOLEAN_FLAG_INVALID,
                "사용 여부 값 불일치: sourceRowNo=" + rowNo + ", sample='" + raw + "'");
    }

    public static boolean parseUsageFlag(String raw, int rowNo) {
        String value = EcountCsvSupport.stripCell(raw);
        if ("사용".equals(value) || value.equalsIgnoreCase("YES") || value.equalsIgnoreCase("Y")) {
            return true;
        }
        if ("미사용".equals(value) || value.equalsIgnoreCase("NO") || value.equalsIgnoreCase("N")) {
            return false;
        }
        throw new BusinessException(ErrorCode.MIG6_BOOLEAN_FLAG_INVALID,
                "사용 flag invalid: sourceRowNo=" + rowNo + ", sample='" + raw + "'");
    }

    public static LocalDate parseDate(String raw, int rowNo, boolean blankAllowed) {
        String value = EcountCsvSupport.stripCell(raw);
        if (value.isBlank()) {
            return blankAllowed ? null : invalidDate(raw, rowNo, null);
        }
        String[] parts = value.split("/");
        if (parts.length != 3) {
            return invalidDate(raw, rowNo, null);
        }
        try {
            return LocalDate.of(Integer.parseInt(parts[0].trim()),
                    Integer.parseInt(parts[1].trim()),
                    Integer.parseInt(parts[2].trim()));
        } catch (DateTimeException | NumberFormatException ex) {
            return invalidDate(raw, rowNo, ex);
        }
    }

    private static LocalDate invalidDate(String raw, int rowNo, Exception cause) {
        throw new BusinessException(ErrorCode.MIG6_DATE_INVALID,
                "일자 형식 불일치: sourceRowNo=" + rowNo + ", sample='" + raw + "'", cause);
    }
}
