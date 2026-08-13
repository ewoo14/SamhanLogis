package com.samhanair.logis.notification.web.dto;

import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 사용자 응답에서 UUID를 URL-safe opaque token으로 표현한다. */
public final class OpaqueUuidCodec {
    private static final Pattern UUID_LITERAL = Pattern.compile(
            "(?i)(?<![0-9a-f])([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-f])");

    private OpaqueUuidCodec() {}

    public static String encode(UUID value) {
        if (value == null) return null;
        ByteBuffer bytes = ByteBuffer.allocate(16)
                .putLong(value.getMostSignificantBits())
                .putLong(value.getLeastSignificantBits());
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes.array());
    }

    public static String maskUuidLiterals(String value) {
        if (value == null || value.isBlank()) return value;
        Matcher matcher = UUID_LITERAL.matcher(value);
        StringBuffer result = new StringBuffer();
        while (matcher.find()) {
            matcher.appendReplacement(result, Matcher.quoteReplacement(encode(UUID.fromString(matcher.group(1)))));
        }
        matcher.appendTail(result);
        return result.toString();
    }
}
