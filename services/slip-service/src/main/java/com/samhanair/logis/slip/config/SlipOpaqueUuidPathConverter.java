package com.samhanair.logis.slip.config;

import com.samhanair.logis.slip.web.dto.OpaqueUuidDeserializer;
import java.util.UUID;
import org.springframework.core.convert.converter.Converter;
import org.springframework.stereotype.Component;

/** 전표 path-variable의 opaque token을 내부 UUID로 복원한다. 기존 UUID도 하위 호환한다. */
@Component
public final class SlipOpaqueUuidPathConverter implements Converter<String, UUID> {
    @Override
    public UUID convert(String source) {
        return OpaqueUuidDeserializer.decode(source);
    }
}
