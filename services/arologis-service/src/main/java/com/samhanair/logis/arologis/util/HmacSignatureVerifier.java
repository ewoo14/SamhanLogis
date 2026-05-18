package com.samhanair.logis.arologis.util;

import java.nio.charset.StandardCharsets;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import lombok.extern.slf4j.Slf4j;

/**
 * HMAC SHA-256 서명 검증 유틸 — Phase 10 W10-2 인성데이타 webhook.
 *
 * <p>인성 vendor webhook {@code X-Insung-Signature} 헤더 검증.
 * sandbox-mode=true 시 검증 우회 (WARN 로그만).
 */
@Slf4j
public final class HmacSignatureVerifier {

    private static final String ALGORITHM = "HmacSHA256";

    private HmacSignatureVerifier() {
    }

    /**
     * HMAC SHA-256 서명 검증.
     *
     * <p>요청 body 의 SHA-256 HMAC 와 헤더의 서명 값 비교.
     * 대소문자 무시 hex 비교 (constant-time 비교로 timing attack 방지).
     *
     * @param secret    HMAC 서명 secret (webhookSecret)
     * @param body      요청 body (raw bytes)
     * @param signature 헤더의 서명 값 (hex string)
     * @return 서명 일치 여부
     */
    public static boolean verify(String secret, byte[] body, String signature) {
        if (secret == null || secret.isBlank()) {
            log.warn("[HmacVerifier] webhookSecret 미설정 — 서명 검증 불가");
            return false;
        }
        if (signature == null || signature.isBlank()) {
            log.warn("[HmacVerifier] X-Insung-Signature 헤더 없음");
            return false;
        }
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            SecretKeySpec keySpec = new SecretKeySpec(
                    secret.getBytes(StandardCharsets.UTF_8), ALGORITHM);
            mac.init(keySpec);
            byte[] computed = mac.doFinal(body);
            String computedHex = toHex(computed);
            // constant-time 비교 (timing attack 방지)
            return constantTimeEquals(computedHex, signature.toLowerCase());
        } catch (Exception ex) {
            log.error("[HmacVerifier] HMAC 계산 오류: {}", ex.getMessage());
            return false;
        }
    }

    /**
     * byte[] → lowercase hex string 변환.
     */
    private static String toHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    /**
     * timing-safe 문자열 비교 — XOR 방식으로 전체 비교 후 결과 반환.
     */
    private static boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) {
            return false;
        }
        int result = 0;
        for (int i = 0; i < a.length(); i++) {
            result |= a.charAt(i) ^ b.charAt(i);
        }
        return result == 0;
    }
}
