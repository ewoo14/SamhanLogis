package com.samhanair.logis.product.web.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** UUID와 opaque token이 섞인 batch lookup 요청을 내부 UUID 목록으로 복원한다. */
public final class OpaqueUuidListDeserializer extends JsonDeserializer<List<UUID>> {
    @Override
    public List<UUID> deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        JsonNode node = parser.getCodec().readTree(parser);
        List<UUID> result = new ArrayList<>();
        for (JsonNode value : node) {
            result.add(OpaqueUuidDeserializer.decode(value.asText()));
        }
        return result;
    }
}
