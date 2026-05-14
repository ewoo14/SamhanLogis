package com.samhanair.logis.arologis.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 아로로지스 JWT 설정 — 2026-05-14 분리.
 *
 * <p>HS256 (HMAC-SHA256) — secret 64+ char 의무 ([[feedback_jwt_secret_min_64]]).
 * accessExpiry 1시간, refreshExpiry 30일 default. arologis-desktop / arologis-mobile 양쪽
 * 공용.
 */
@ConfigurationProperties(prefix = "samhan.arologis.jwt")
@Getter
@Setter
public class ArologisJwtProperties {

    /** HS256 HMAC secret — 64+ char 의무. dev 환경은 application.yml chained-default. */
    private String secret;

    /** Access token 유효 (초) — 기본 1시간 (3600s). */
    private long accessExpirySeconds = 3600L;

    /** Refresh token 유효 (초) — 기본 30일 (2592000s). */
    private long refreshExpirySeconds = 2592000L;

    /** JWT issuer claim — Bearer 검증 시 검사 (arologis-service 고정). */
    private String issuer = "arologis-service";
}
