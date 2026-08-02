package com.samhanair.logis.accounting.service;

import java.util.Locale;

/** Code.js:191-211 모델 토큰 분류와 카탈로그 kind 충돌을 좁게 해소한다. */
final class LegacyModelKindClassifier {

    private LegacyModelKindClassifier() {
    }

    /**
     * 레거시 토큰이 주 품목으로 분류하는 경우에만 generic ACCESSORY를 보정한다.
     * 명시적인 PANEL/REMOTE/MATERIAL 등 카탈로그 kind는 다시 분류하지 않는다.
     */
    static String riUsageKind(String catalogKind, String modelToken) {
        String catalog = catalogKind == null || catalogKind.isBlank() ? "ACCESSORY" : catalogKind;
        String legacy = classify(modelToken);
        if ("ACCESSORY".equals(catalog) && isRiUsageMain(legacy)) {
            return legacy;
        }
        return catalog;
    }

    private static String classify(String value) {
        String u = value == null ? "" : value.toUpperCase(Locale.ROOT);
        if (u.startsWith("AWR-") || u.startsWith("AR-")) {
            return "REMOTE";
        }
        if (u.matches("^AC\\d{3}.*") && u.length() >= 7) {
            if (u.charAt(6) == 'N') {
                return "INDOOR";
            }
            if (u.charAt(6) == 'X') {
                return "OUTDOOR";
            }
        }
        if (u.matches("^AR\\d{2}.*") && u.length() >= 12 && !u.contains("-")) {
            if (u.charAt(11) == 'N') {
                return "INDOOR";
            }
            if (u.charAt(11) == 'X') {
                return "OUTDOOR";
            }
            if (u.charAt(11) == 'Q') {
                return "SUB_INDOOR";
            }
        }
        if (u.matches("^AF\\d{2}.*") && u.length() >= 12) {
            if (u.charAt(11) == 'N') {
                return "INDOOR";
            }
            if (u.charAt(11) == 'X') {
                return "OUTDOOR";
            }
        }
        return "MATERIAL";
    }

    private static boolean isRiUsageMain(String kind) {
        return "INDOOR".equals(kind) || "OUTDOOR".equals(kind) || "SUB_INDOOR".equals(kind);
    }
}
