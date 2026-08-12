package com.samhanair.logis.accounting.web.dto;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.UUID;

/** 사용자 응답에서 내부 UUID를 결정적인 URL-safe opaque token으로 직렬화한다. */
public final class OpaqueUuidSerializer extends JsonSerializer<UUID> {
    public static String encode(UUID value) {
        if (value == null) return null;
        ByteBuffer bytes = ByteBuffer.allocate(16)
                .putLong(value.getMostSignificantBits())
                .putLong(value.getLeastSignificantBits());
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes.array());
    }

    @Override
    public void serialize(UUID value, JsonGenerator gen, SerializerProvider serializers) throws IOException {
        gen.writeString(encode(value));
    }
}
