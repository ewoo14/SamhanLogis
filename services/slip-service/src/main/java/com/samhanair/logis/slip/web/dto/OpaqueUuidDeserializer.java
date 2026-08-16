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

    /** opaque path 식별자 형식이 잘못된 경우에만 사용하는 입력 예외. */
    public static final class InvalidOpaqueUuidException extends IllegalArgumentException {
        public InvalidOpaqueUuidException() {
            super("요청 파라미터 형식이 올바르지 않습니다.");
        }
    }

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
            throw new InvalidOpaqueUuidException();
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ignored) {
            try {
                byte[] bytes = Base64.getUrlDecoder().decode(value);
                if (bytes.length != 16) {
                    throw new InvalidOpaqueUuidException();
                }
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                return new UUID(buffer.getLong(), buffer.getLong());
            } catch (IllegalArgumentException ex) {
                throw new InvalidOpaqueUuidException();
            }
        }
    }
}
