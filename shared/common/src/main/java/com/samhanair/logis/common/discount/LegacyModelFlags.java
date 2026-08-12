package com.samhanair.logis.common.discount;

import java.util.Locale;

/**
 * 레거시 종합견적서 {@code getModelFlags(model)}와 동일한 싱글 세트 모델 판별.
 *
 * <p>이 규칙은 {@code products.discount_flags}가 아니라 모델코드 위치 규칙을 정본으로 삼는다.
 * 분기 순서와 AP230/AP290 예외를 레거시와 동일하게 유지한다.
 */
public record LegacyModelFlags(
        boolean is360,
        boolean is4Way,
        boolean is1Way,
        boolean isStand,
        boolean isDeluxe,
        boolean isFirstGrade) {

    public static final LegacyModelFlags NONE = new LegacyModelFlags(false, false, false, false, false, false);

    /** 레거시 {@code getModelFlags(model)}를 그대로 재현한다. */
    public static LegacyModelFlags from(String model) {
        String m = model == null ? "" : model.toUpperCase(Locale.ROOT);
        boolean is360 = false;
        boolean is4Way = false;
        boolean is1Way = false;
        boolean isStand = false;
        boolean isDeluxe = false;
        boolean isGrade1 = false;
        if (m.contains("360")) is360 = true;

        if (m.startsWith("AC") && m.length() >= 9) {
            if (m.charAt(7) == '6' && m.charAt(8) == 'P') is360 = true;
            if (m.charAt(7) == '4' && (m.charAt(8) == 'P' || m.charAt(8) == 'D')) is4Way = true;
            if (m.charAt(7) == '1' && (m.charAt(8) == 'P' || m.charAt(8) == 'D')) is1Way = true;
        }
        if (m.startsWith("AP") && m.length() >= 9) {
            if (m.length() >= 11 && m.charAt(10) == 'C') {
                if (m.charAt(8) == 'D') isStand = true;
            } else if (m.charAt(8) == 'P') {
                isStand = true;
            }
            if (m.length() >= 11 && m.charAt(8) == 'D' && m.charAt(10) == 'H') isDeluxe = true;
            if (m.startsWith("AP230") || m.startsWith("AP290")) {
                isStand = true;
                isDeluxe = false;
            }
        }
        if ((m.startsWith("AC") || m.startsWith("AP")) && m.length() >= 9 && m.charAt(8) == 'F') {
            isGrade1 = true;
        }
        return new LegacyModelFlags(is360, is4Way, is1Way, isStand, isDeluxe, isGrade1);
    }
}
