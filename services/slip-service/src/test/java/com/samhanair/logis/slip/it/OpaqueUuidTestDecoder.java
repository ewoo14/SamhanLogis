package com.samhanair.logis.slip.it;

import com.samhanair.logis.slip.web.dto.OpaqueUuidDeserializer;
import java.util.UUID;

/** 공개 응답의 UUID/opaque 식별자를 격리 테스트 내부 UUID로 복원하는 공통 helper. */
public final class OpaqueUuidTestDecoder {
    private OpaqueUuidTestDecoder() {
    }

    public static UUID decode(String value) {
        return OpaqueUuidDeserializer.decode(value);
    }
}
