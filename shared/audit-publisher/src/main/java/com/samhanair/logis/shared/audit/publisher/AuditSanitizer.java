package com.samhanair.logis.shared.audit.publisher;

import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

public final class AuditSanitizer {
    private static final Pattern UUID_PATTERN = Pattern.compile("(?i)(?:urn:uuid:)?[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])");
    public static final String UNKNOWN_RESOURCE = "대상 식별자 미상";
    private AuditSanitizer() {}

    public static String display(String value) {
        if (value == null || value.isBlank() || UUID_PATTERN.matcher(value).find()) return UNKNOWN_RESOURCE;
        return value.trim();
    }

    public static Map<String, Object> displayMap(Map<String, Object> values) {
        if (values == null) return null;
        return values.entrySet().stream().collect(java.util.stream.Collectors.toUnmodifiableMap(
                Map.Entry::getKey, entry -> sanitizeValue(entry.getValue())));
    }

    private static Object sanitizeValue(Object value) {
        if (value instanceof String s) return UUID_PATTERN.matcher(s).find() ? UNKNOWN_RESOURCE : s;
        if (value instanceof Map<?, ?> map) return map.entrySet().stream().collect(java.util.stream.Collectors.toUnmodifiableMap(
                entry -> String.valueOf(entry.getKey()), entry -> sanitizeValue(entry.getValue())));
        return value;
    }
}
