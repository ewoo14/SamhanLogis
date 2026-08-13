package com.samhanair.logis.product.web.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.UUID;

/** opaque 응답 token과 기존 UUID 요청을 모두 내부 UUID로 해석한다. */
public final class OpaqueUuidDeserializer extends JsonDeserializer<UUID> {
    public static UUID decode(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ignored) {
            byte[] bytes = Base64.getUrlDecoder().decode(value);
            if (bytes.length != 16) throw new IllegalArgumentException("유효하지 않은 식별자입니다.");
            ByteBuffer buffer = ByteBuffer.wrap(bytes);
            return new UUID(buffer.getLong(), buffer.getLong());
        }
    }

    @Override
    public UUID deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        try {
            return decode(parser.getValueAsString());
        } catch (RuntimeException ex) {
            return (UUID) context.handleWeirdStringValue(UUID.class, parser.getValueAsString(), ex.getMessage());
        }
    }
}
