package com.samhanair.logis.common.exception;

import java.util.regex.Pattern;

/**
 * 사용자 응답으로 반환되는 예외 메시지에서 내부 UUID 식별자를 제거한다.
 */
public final class ExceptionMessageSanitizer {

    private static final String UUID_PATTERN =
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
    private static final Pattern QUOTED_UUID = Pattern.compile("\\s*['\"]" + UUID_PATTERN + "['\"]\\s*");
    private static final Pattern UUID = Pattern.compile(UUID_PATTERN);
    private static final Pattern EMPTY_KEY_VALUE =
            Pattern.compile("(?U)\\s*\\b\\w+\\s*=\\s*(?=[),]|$)");
    private static final Pattern LEADING_COMMA_IN_PARENS = Pattern.compile("\\(\\s*,\\s*");
    private static final Pattern EMPTY_PARENS = Pattern.compile("\\s*\\(\\s*\\)");
    private static final Pattern SPACES = Pattern.compile("\\s+");
    private static final Pattern SPACE_BEFORE_PUNCTUATION = Pattern.compile("\\s+([,.:;!?\\)])");
    private static final Pattern TRAILING_RESIDUE = Pattern.compile("[\\s:=,;\\-\\(]+$");

    private ExceptionMessageSanitizer() {
    }

    public static String sanitize(String message) {
        if (message == null) {
            return null;
        }

        String sanitized = QUOTED_UUID.matcher(message).replaceAll(" ");
        sanitized = UUID.matcher(sanitized).replaceAll("");
        sanitized = EMPTY_KEY_VALUE.matcher(sanitized).replaceAll("");
        sanitized = LEADING_COMMA_IN_PARENS.matcher(sanitized).replaceAll("(");
        sanitized = EMPTY_PARENS.matcher(sanitized).replaceAll("");
        sanitized = SPACE_BEFORE_PUNCTUATION.matcher(sanitized).replaceAll("$1");
        sanitized = SPACES.matcher(sanitized).replaceAll(" ").trim();
        sanitized = TRAILING_RESIDUE.matcher(sanitized).replaceAll("").trim();
        return sanitized;
    }
}
