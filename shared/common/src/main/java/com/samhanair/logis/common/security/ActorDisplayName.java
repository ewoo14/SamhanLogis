package com.samhanair.logis.common.security;

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
    private static final Pattern INVISIBLE_ACTOR_CHARACTERS = Pattern.compile("[\\u00AD\\u200B-\\u200D\\u2060\\uFEFF]");
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
            return "system";
        }
        String knownName = knownName(callerName);
        if (knownName != null) {
            return knownName;
        }
        if (hasText(callerId) && !isUuid(callerId)) {
            return callerId;
        }
        return hasText(callerName) || hasText(callerId) ? UNKNOWN : "system";
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
        return hasText(value) && !isUuid(value) ? value : null;
    }

    private static boolean hasText(String value) {
        return value != null && !normalizeForComparison(value).isBlank();
    }

    private static boolean isSystemActor(String value) {
        return SYSTEM_ACTOR_ID.equalsIgnoreCase(normalizeForComparison(value));
    }

    private static String normalizeForComparison(String value) {
        return value == null ? "" : INVISIBLE_ACTOR_CHARACTERS.matcher(value).replaceAll("").trim();
    }
}
