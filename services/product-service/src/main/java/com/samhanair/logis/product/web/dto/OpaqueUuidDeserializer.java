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
    /** opaque path/query 식별자 형식이 잘못된 경우에만 사용하는 입력 예외. */
    public static final class InvalidOpaqueUuidException extends IllegalArgumentException {
        public InvalidOpaqueUuidException() {
            super("요청 파라미터 형식이 올바르지 않습니다.");
        }
    }

    public static UUID decode(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ignored) {
            try {
                byte[] bytes = Base64.getUrlDecoder().decode(value);
                if (bytes.length != 16) throw new InvalidOpaqueUuidException();
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                return new UUID(buffer.getLong(), buffer.getLong());
            } catch (IllegalArgumentException ex) {
                throw new InvalidOpaqueUuidException();
            }
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
