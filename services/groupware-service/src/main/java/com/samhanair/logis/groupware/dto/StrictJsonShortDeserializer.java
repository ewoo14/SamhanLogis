package com.samhanair.logis.groupware.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.JsonDeserializer;
import java.math.BigDecimal;
import java.io.IOException;

/** Jackson scalar coercion을 막되 FE JSON.parse와 같은 수치상 정수만 받는 Short deserializer. */
public final class StrictJsonShortDeserializer extends JsonDeserializer<Short> {

    @Override
    public Short deserialize(JsonParser parser, DeserializationContext context) throws IOException {
        JsonToken token = parser.currentToken();
        if (token != JsonToken.VALUE_NUMBER_INT && token != JsonToken.VALUE_NUMBER_FLOAT) {
            throw JsonMappingException.from(parser, "문서 양식 schemaVersion은 JSON 수치상 정수여야 합니다");
        }

        final int value;
        try {
            // FE는 JSON.parse 후 schemaVersion !== 1을 비교하므로 1.0/1e0은 1과 같다.
            // BigDecimal의 trailing zero를 제거하면 수치상 정수 여부를 정확히 판정할 수 있다.
            BigDecimal number = parser.getDecimalValue();
            if (number.stripTrailingZeros().scale() > 0) {
                throw JsonMappingException.from(parser, "문서 양식 schemaVersion은 수치상 정수여야 합니다");
            }
            value = number.intValueExact();
        } catch (ArithmeticException ex) {
            throw JsonMappingException.from(parser, "문서 양식 schemaVersion 정수 범위를 초과했습니다");
        }
        if (value < Short.MIN_VALUE || value > Short.MAX_VALUE) {
            throw JsonMappingException.from(parser, "문서 양식 schemaVersion 정수 범위를 초과했습니다");
        }
        return (short) value;
    }
}
