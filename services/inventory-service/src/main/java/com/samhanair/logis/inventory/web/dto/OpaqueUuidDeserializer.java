package com.samhanair.logis.inventory.web.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.samhanair.logis.inventory.client.OpaqueUuidDecoder;
import java.io.IOException;
import java.util.UUID;

/** opaque 창고 token과 기존 raw UUID를 모두 내부 UUID로 복원한다. */
public final class OpaqueUuidDeserializer extends JsonDeserializer<UUID> {

    public OpaqueUuidDeserializer() {
    }

    public static UUID decode(String value) {
        return OpaqueUuidDecoder.decode(value);
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
}
