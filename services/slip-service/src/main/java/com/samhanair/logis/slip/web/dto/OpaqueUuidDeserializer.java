package com.samhanair.logis.slip.web.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.UUID;

/** 목록 응답의 opaque token 또는 기존 UUID를 HTTP 입력용 내부 UUID로 복원한다. */
public final class OpaqueUuidDeserializer extends JsonDeserializer<UUID> {

    public OpaqueUuidDeserializer() {
    }

    @Override
    public UUID deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        String value = parser.getValueAsString();
        try {
            return decode(value);
        } catch (IllegalArgumentException ex) {
            return (UUID) context.handleWeirdStringValue(UUID.class, value, ex.getMessage());
        }
    }

    public static UUID decode(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("유효하지 않은 전표 식별자입니다.");
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ignored) {
            try {
                byte[] bytes = Base64.getUrlDecoder().decode(value);
                if (bytes.length != 16) {
                    throw new IllegalArgumentException("유효하지 않은 전표 식별자입니다.");
                }
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                return new UUID(buffer.getLong(), buffer.getLong());
            } catch (IllegalArgumentException ex) {
                throw new IllegalArgumentException("유효하지 않은 전표 식별자입니다.", ex);
            }
        }
    }
}
