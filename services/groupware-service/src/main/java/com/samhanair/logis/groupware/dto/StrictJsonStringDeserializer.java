package com.samhanair.logis.groupware.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.JsonDeserializer;
import java.io.IOException;

/** Jackson scalar coercion을 막고 JSON 문자열 원시 타입만 받는 deserializer. */
public final class StrictJsonStringDeserializer extends JsonDeserializer<String> {

    @Override
    public String deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        if (parser.currentToken() != JsonToken.VALUE_STRING) {
            throw JsonMappingException.from(parser, "문서 양식 문자열 필드는 JSON 문자열이어야 합니다");
        }
        return parser.getText();
    }
}
