package com.samhanair.logis.common.security;

import java.text.Normalizer;
import java.util.regex.Pattern;

/**
 * 사용자 표시명 경계에서 caller 식별자가 이름으로 흘러들지 않도록 하는 공통 helper.
 *
 * <p>callerId 자체는 내부 audit/route/join 키로 계속 사용한다. 이 helper는 문자열 표시명만
 * 결정하며, UUID 모양 값은 {@code 변경자 미상} 또는 nullable 결과로 바꾼다.
 */
public final class ActorDisplayName {

    public static final String UNKNOWN = "변경자 미상";
    private static final String SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000";
    private static final String SYSTEM_DISPLAY_NAME = "시스템";
    private static final Pattern FORMAT_CHARACTERS = Pattern.compile("\\p{Cf}+");
    private static final Pattern UUID_DASHES = Pattern.compile("[\\u2010-\\u2015\\u2212\\uFE58\\uFE63\\uFF0D]");
    private static final Pattern UUID_FORM = Pattern.compile(
            "^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
                    + "|\\{(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32})\\}"
                    + "|(?i:urn:uuid:)(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32})"
                    + "|[0-9a-fA-F]{32})$");

    private ActorDisplayName() {
    }

    /** 사용자 표시명이 필요한 경로의 이름을 결정한다. */
    public static String resolve(String callerId, String callerName) {
        if (isSystemActor(callerId)) {
            return SYSTEM_DISPLAY_NAME;
        }
        String knownName = knownName(callerName);
        if (knownName != null) {
            return knownName;
        }
        if (hasText(callerId) && !isUuid(callerId)) {
            return isSystemToken(callerId) ? SYSTEM_DISPLAY_NAME : callerId;
        }
        return hasText(callerName) || hasText(callerId) ? UNKNOWN : SYSTEM_DISPLAY_NAME;
    }

    /** 버전 이력처럼 이름 부재를 nullable로 표현하는 기존 계약용 resolver. */
    public static String resolveNullable(String callerId, String callerName) {
        String knownName = knownName(callerName);
        if (knownName != null) {
            return knownName;
        }
        return hasText(callerId) && !isUuid(callerId) ? callerId : null;
    }

    /** canonical/중괄호/URN/32자 hex UUID 형태를 식별한다. */
    public static boolean isUuid(String value) {
        return value != null && UUID_FORM.matcher(normalizeForComparison(value)).matches();
    }

    private static String knownName(String value) {
        if (!hasText(value) || isUuid(value)) {
            return null;
        }
        return isSystemToken(value) ? SYSTEM_DISPLAY_NAME : value;
    }

    private static boolean hasText(String value) {
        return value != null && !normalizeForComparison(value).isBlank();
    }

    private static boolean isSystemActor(String value) {
        return SYSTEM_ACTOR_ID.equalsIgnoreCase(normalizeForComparison(value));
    }

    private static boolean isSystemToken(String value) {
        return "system".equalsIgnoreCase(normalizeForComparison(value));
    }

    private static String normalizeForComparison(String value) {
        if (value == null) {
            return "";
        }
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFKC);
        normalized = FORMAT_CHARACTERS.matcher(normalized).replaceAll("");
        normalized = UUID_DASHES.matcher(normalized).replaceAll("-");
        return foldConfusables(normalized).trim();
    }

    /** UUID에 자주 섞이는 라틴/그리스/키릴 유사문자를 비교용 ASCII로 접는다. */
    private static String foldConfusables(String value) {
        StringBuilder result = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            result.append(switch (value.charAt(i)) {
                case '\u0391', '\u0410', '\u0430' -> 'a';
                case '\u0392', '\u0412', '\u0432' -> 'b';
                case '\u03A7', '\u0421', '\u0441' -> 'c';
                case '\u0395', '\u0415', '\u0435' -> 'e';
                case '\u03A6' -> 'f';
                default -> value.charAt(i);
            });
        }
        return result.toString();
    }
}
