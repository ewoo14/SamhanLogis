package com.samhanair.logis.inventory.client;

import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.UUID;

/** slip-service wire 계약의 opaque UUID token을 inventory 내부 UUID로 복원한다. */
final class OpaqueUuidDecoder {

    private OpaqueUuidDecoder() {
    }

    static UUID decode(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("유효하지 않은 전표 식별자입니다.");
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ignored) {
            try {
                byte[] bytes = Base64.getUrlDecoder().decode(value);
                if (bytes.length != 16) {
                    throw new IllegalArgumentException("유효하지 않은 전표 식별자입니다.");
                }
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                return new UUID(buffer.getLong(), buffer.getLong());
            } catch (IllegalArgumentException ex) {
                throw new IllegalArgumentException("유효하지 않은 전표 식별자입니다.", ex);
            }
        }
    }
}
