package com.samhanair.logis.slip.estimate.web.dto;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import java.io.IOException;
import java.util.UUID;

/** 문자열로 보관된 사용자 식별자도 공개 응답에서는 opaque token으로 직렬화한다. */
public final class OpaqueIdentifierSerializer extends JsonSerializer<String> {

    @Override
    public void serialize(String value, JsonGenerator gen, SerializerProvider serializers) throws IOException {
        if (value == null || value.isBlank()) {
            gen.writeString(value);
            return;
        }
        try {
            gen.writeString(OpaqueUuidCodec.encode(UUID.fromString(value)));
        } catch (IllegalArgumentException ignored) {
            gen.writeString(value);
        }
    }
}
