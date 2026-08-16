package com.samhanair.logis.partnerorder.client;

import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.UUID;

/** 서비스 간 UUID/opaque 식별자 wire 계약을 내부 UUID로 복원한다. */
public final class OpaqueUuidDecoder {
    private static final int OPAQUE_TOKEN_LENGTH = 22;
    private static final String INVALID_PRODUCT_IDENTIFIER = "유효하지 않은 제품 식별자입니다.";
    private OpaqueUuidDecoder() {
    }

    public static UUID decode(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ignored) {
            if (!isOpaqueToken(value)) {
                throw invalidProductIdentifier();
            }
            try {
                byte[] bytes = Base64.getUrlDecoder().decode(value);
                if (bytes.length != 16) {
                    throw invalidProductIdentifier();
                }
                ByteBuffer buffer = ByteBuffer.wrap(bytes);
                return new UUID(buffer.getLong(), buffer.getLong());
            } catch (IllegalArgumentException ex) {
                throw invalidProductIdentifier();
            }
        }
    }

    /** product-service가 발급하는 무패딩 URL-safe Base64 UUID token 문법을 검증한다. */
    private static boolean isOpaqueToken(String value) {
        if (value.length() != OPAQUE_TOKEN_LENGTH) {
            return false;
        }
        boolean hasNonDigit = false;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            boolean urlSafe = (c >= 'A' && c <= 'Z')
                    || (c >= 'a' && c <= 'z')
                    || (c >= '0' && c <= '9')
                    || c == '-' || c == '_';
            if (!urlSafe) {
                return false;
            }
            hasNonDigit |= c < '0' || c > '9';
        }
        return hasNonDigit;
    }

    private static IllegalArgumentException invalidProductIdentifier() {
        return new IllegalArgumentException(INVALID_PRODUCT_IDENTIFIER);
    }
}
