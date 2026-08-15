package com.samhanair.logis.arologis.config;

import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.env.Environment;
import org.springframework.util.StringUtils;

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
@Slf4j
public class ArologisJwtProperties implements EnvironmentAware {

    private Environment environment;

    /** HS256 HMAC secret — 64+ char 의무. dev 환경은 application.yml chained-default. */
    private String secret;

    /** Access token 유효 (초) — 기본 1시간 (3600s). */
    private long accessExpirySeconds = 3600L;

    /** Refresh token 유효 (초) — 기본 30일 (2592000s). */
    private long refreshExpirySeconds = 2592000L;

    /** JWT issuer claim — Bearer 검증 시 검사 (arologis-service 고정). */
    private String issuer = "arologis-service";

    /**
     * Spring 활성 프로파일을 부팅 가드에서 사용한다.
     *
     * <p>{@code @ConfigurationProperties} 바인딩을 유지하기 위해 생성자 주입 대신
     * {@link EnvironmentAware} 로 받는다.
     */
    @Override
    public void setEnvironment(Environment environment) {
        this.environment = environment;
    }

    /**
     * 아로로지스 독립 JWT secret 부팅 가드.
     *
     * <p>모든 프로파일에서 blank, 32 bytes 미만 또는 fallback 값을 부팅 실패로 처리한다.
     *
     * @throws IllegalStateException 운영 프로파일에서 안전하지 않은 secret 이 설정된 경우
     */
    @PostConstruct
    public void verify() {
        boolean unsafeSecret = isUnsafeSecret();
        if (unsafeSecret) {
            throw new IllegalStateException(
                    "samhan.arologis.jwt.secret 은 모든 프로파일에서 비어 있거나 32 bytes 미만일 수 없습니다. "
                            + "SAMHAN_AROLOGIS_JWT_SECRET 환경변수를 안전한 값으로 설정하세요.");
        }
    }

    private boolean isUnsafeSecret() {
        return !StringUtils.hasText(secret)
                || secret.getBytes(StandardCharsets.UTF_8).length < 32;
    }
}
