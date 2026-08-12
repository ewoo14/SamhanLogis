package com.samhanair.logis.slip.web.dto;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import java.io.IOException;
import java.util.UUID;

/** UUID 문자열로 보관된 사용자 식별자도 응답에서 동일한 opaque token으로 직렬화한다. */
public final class OpaqueUuidStringSerializer extends JsonSerializer<String> {
    @Override
    public void serialize(String value, JsonGenerator gen, SerializerProvider serializers) throws IOException {
        try {
            gen.writeString(OpaqueUuidSerializer.encode(UUID.fromString(value)));
        } catch (IllegalArgumentException ignored) {
            gen.writeString(value);
        }
    }
}
