package com.samhanair.logis.partnerorder.client;

import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.UUID;

/** 서비스 간 UUID/opaque 식별자 wire 계약을 내부 UUID로 복원한다. */
public final class OpaqueUuidDecoder {
    private OpaqueUuidDecoder() {
    }

    public static UUID decode(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ignored) {
            byte[] bytes = Base64.getUrlDecoder().decode(value);
            if (bytes.length != 16) {
                throw new IllegalArgumentException("유효하지 않은 제품 식별자입니다.");
            }
            ByteBuffer buffer = ByteBuffer.wrap(bytes);
            return new UUID(buffer.getLong(), buffer.getLong());
        }
    }
}
