package com.samhanair.logis.slip.estimate.web.dto;

import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.UUID;

/** 견적 응답·URL에서 내부 UUID를 URL-safe opaque token으로 감추고 복원한다. */
public final class OpaqueUuidCodec {

    private OpaqueUuidCodec() {
    }

    /** UUID를 padding 없는 Base64URL token으로 변환한다. */
    public static String encode(UUID value) {
        if (value == null) return null;
        ByteBuffer bytes = ByteBuffer.allocate(16)
                .putLong(value.getMostSignificantBits())
                .putLong(value.getLeastSignificantBits());
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes.array());
    }

    /** UUID 문자열 또는 opaque token을 내부 UUID로 복원한다. */
    public static UUID decode(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("유효하지 않은 견적 식별자입니다.");
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ignored) {
            try {
                byte[] bytes = Base64.getUrlDecoder().decode(value);
                if (bytes.length != 16) {
                    throw new IllegalArgumentException("유효하지 않은 견적 식별자입니다.");
                }
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                return new UUID(buffer.getLong(), buffer.getLong());
            } catch (IllegalArgumentException ex) {
                throw new IllegalArgumentException("유효하지 않은 견적 식별자입니다.", ex);
            }
        }
    }
}
