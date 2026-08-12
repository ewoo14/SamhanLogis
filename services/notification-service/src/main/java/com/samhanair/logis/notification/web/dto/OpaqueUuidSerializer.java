package com.samhanair.logis.notification.web.dto;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import java.io.IOException;
import java.util.UUID;

/** Notification center DTO의 UUID id를 JSON에서 opaque token으로 직렬화한다. */
public final class OpaqueUuidSerializer extends JsonSerializer<UUID> {
    @Override
    public void serialize(UUID value, JsonGenerator gen, SerializerProvider serializers) throws IOException {
        gen.writeString(OpaqueUuidCodec.encode(value));
    }
}
