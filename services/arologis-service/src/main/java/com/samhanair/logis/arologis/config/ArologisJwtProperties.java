package com.samhanair.logis.arologis.config;

import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Set;
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

    /** 운영 프로파일 별칭. 독립 배포의 production 프로파일도 fail-fast 대상이다. */
    private static final Set<String> PROD_PROFILES = Set.of("prod", "production");

    /** 아로로지스 독립 JWT 개발 기본값. 운영 서명키로 사용하면 안 된다. */
    private static final String DEV_DEFAULT_SECRET =
            "dev-only-secret-must-be-64-chars-or-longer-for-hmac-sha256-min-x";

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
     * <p>운영 프로파일에서는 blank, 32 bytes 미만, 공개된 dev 기본값을 부팅 실패로
     * 처리한다. 비운영은 개발 compose 호환을 위해 경고만 기록한다.
     *
     * @throws IllegalStateException 운영 프로파일에서 안전하지 않은 secret 이 설정된 경우
     */
    @PostConstruct
    public void verify() {
        boolean unsafeSecret = isUnsafeSecret();
        if (isProductionProfile() && unsafeSecret) {
            throw new IllegalStateException(
                    "samhan.arologis.jwt.secret 은 운영 프로파일에서 비어 있거나, 32 bytes 미만이거나, "
                            + "공개된 dev 기본값일 수 없습니다. SAMHAN_AROLOGIS_JWT_SECRET 환경변수를 안전한 값으로 설정하세요.");
        }
        if (unsafeSecret) {
            log.warn("[보안] samhan.arologis.jwt.secret 이 비어 있거나 짧거나 공개된 dev 기본값입니다. "
                    + "비운영 환경이면 무시 가능하지만 배포 전 SAMHAN_AROLOGIS_JWT_SECRET 교체가 필요합니다.");
        }
    }

    private boolean isProductionProfile() {
        return environment != null && Arrays.stream(environment.getActiveProfiles())
                .map(String::toLowerCase)
                .anyMatch(PROD_PROFILES::contains);
    }

    private boolean isUnsafeSecret() {
        return !StringUtils.hasText(secret)
                || secret.getBytes(StandardCharsets.UTF_8).length < 32
                || DEV_DEFAULT_SECRET.equals(secret);
    }
}
