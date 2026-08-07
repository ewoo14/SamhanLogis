package com.samhanair.logis.product.domain;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collection;
import java.util.UUID;

/** 활성 구성품 집합을 사용자에게 UUID로 노출하지 않고 결박하는 불투명 토큰. */
public final class BundleComponentConsentToken {

    private BundleComponentConsentToken() {
    }

    public static String from(Collection<BundleComponent> components) {
        String canonical = components.stream()
                .map(BundleComponent::getId)
                .sorted()
                .map(UUID::toString)
                .reduce((left, right) -> left + "\n" + right)
                .orElse("");
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(canonical.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte value : digest) {
                hex.append(String.format("%02x", value));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256을 사용할 수 없습니다", ex);
        }
    }
}
