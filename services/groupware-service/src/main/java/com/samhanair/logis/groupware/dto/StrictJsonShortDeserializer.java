package com.samhanair.logis.groupware.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.JsonDeserializer;
import java.io.IOException;

/** Jackson scalar coercion을 막고 JSON 정수 원시 타입만 받는 Short deserializer. */
public final class StrictJsonShortDeserializer extends JsonDeserializer<Short> {

    @Override
    public Short deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        if (parser.currentToken() != JsonToken.VALUE_NUMBER_INT) {
            throw JsonMappingException.from(parser, "문서 양식 schemaVersion은 JSON 정수여야 합니다");
        }
        int value = parser.getIntValue();
        if (value < Short.MIN_VALUE || value > Short.MAX_VALUE) {
            throw JsonMappingException.from(parser, "문서 양식 schemaVersion 정수 범위를 초과했습니다");
        }
        return (short) value;
    }
}
