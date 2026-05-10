package com.samhanair.logis.accounting.util;

import java.math.BigDecimal;

/**
 * 금액 → 한글 변환 유틸리티 (P0-4 세금계산서 인쇄용).
 *
 * <p>한국 세금계산서 양식 표준: "일금N원정" 형식.
 * 예: 3,050,000 → "일금삼백오만원정"
 *
 * <p>지원 범위: 0 ~ 999,999,999,999 (1조 미만). 음수 미지원 (세금계산서 양수 금액만).
 */
public final class KoreanAmountConverter {

    private KoreanAmountConverter() {}

    private static final String[] UNITS = {"", "십", "백", "천"};
    private static final String[] GROUPS = {"", "만", "억", "조"};
    private static final String[] DIGITS = {"", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"};

    /**
     * BigDecimal 금액 → 한글 금액 문자열 변환.
     *
     * @param amount 금액 (소수점 이하 버림)
     * @return 한글 금액 — 예: "일금삼백오만원정". 0 이면 "일금영원정"
     */
    public static String convert(BigDecimal amount) {
        if (amount == null || amount.signum() == 0) {
            return "일금영원정";
        }
        long value = amount.setScale(0, java.math.RoundingMode.DOWN).longValue();
        if (value < 0) {
            return "일금(음수)원정";
        }
        return "일금" + toKorean(value) + "원정";
    }

    private static String toKorean(long value) {
        if (value == 0) {
            return "영";
        }
        StringBuilder sb = new StringBuilder();
        int groupIndex = 0;
        while (value > 0) {
            int group = (int) (value % 10000);
            if (group != 0) {
                sb.insert(0, groupText(group) + GROUPS[groupIndex]);
            }
            value /= 10000;
            groupIndex++;
        }
        return sb.toString();
    }

    private static String groupText(int group) {
        StringBuilder sb = new StringBuilder();
        int[] digits = {group / 1000, (group % 1000) / 100, (group % 100) / 10, group % 10};
        for (int i = 0; i < 4; i++) {
            int d = digits[i];
            if (d == 0) {
                continue;
            }
            // "일십" 은 "십" 으로 표기 (일천, 일백 도 동일)
            if (d == 1 && i > 0) {
                sb.append(UNITS[3 - i]);
            } else {
                sb.append(DIGITS[d]).append(UNITS[3 - i]);
            }
        }
        return sb.toString();
    }
}
