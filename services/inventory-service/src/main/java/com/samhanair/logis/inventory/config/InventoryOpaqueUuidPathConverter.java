package com.samhanair.logis.inventory.config;

import com.samhanair.logis.inventory.client.OpaqueUuidDecoder;
import java.util.UUID;
import org.springframework.core.convert.converter.Converter;
import org.springframework.stereotype.Component;

/** inventory HTTP 경계에서 opaque 창고 token과 기존 raw UUID를 함께 허용한다. */
@Component
public final class InventoryOpaqueUuidPathConverter implements Converter<String, UUID> {

    @Override
    public UUID convert(String source) {
        return OpaqueUuidDecoder.decode(source);
    }
}
