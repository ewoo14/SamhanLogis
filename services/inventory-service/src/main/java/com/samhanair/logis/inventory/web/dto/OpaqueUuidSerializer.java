package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.samhanair.logis.inventory.client.OpaqueUuidDecoder;
import java.io.IOException;
import java.util.UUID;

/** 사용자 응답의 UUID를 slip-service와 동일한 opaque token으로 직렬화한다. */
public final class OpaqueUuidSerializer extends JsonSerializer<UUID> {

    public static String encode(UUID value) {
        return OpaqueUuidDecoder.encode(value);
    }

    @Override
    public void serialize(UUID value, JsonGenerator generator, SerializerProvider serializers)
            throws IOException {
        generator.writeString(encode(value));
    }
}
