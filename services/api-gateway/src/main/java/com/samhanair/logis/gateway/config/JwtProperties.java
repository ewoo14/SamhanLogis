package com.samhanair.logis.gateway.config;

import jakarta.annotation.PostConstruct;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Set;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.env.Environment;
import org.springframework.util.StringUtils;

/**
 * Bound JWT settings — secret key + token TTL — read from
 * {@code app.security.jwt.*}. Mirrors the equivalent properties on
 * {@code auth-service} so both sides sign / verify with the same material.
 */
@Data
@Slf4j
@ConfigurationProperties(prefix = "app.security.jwt")
public class JwtProperties implements EnvironmentAware {

    /** 운영 프로파일 별칭. prod/production 모두 공개 dev secret 사용을 부팅 시 차단한다. */
    private static final Set<String> PROD_PROFILES = Set.of("prod", "production");

    /** 저장소에 노출된 개발용 JWT secret. 운영에서는 서명키로 사용할 수 없다. */
    private static final Set<String> DEV_DEFAULT_SECRETS = Set.of(
            "dev-secret-change-me-in-production-32bytes-min!",
            "dev-only-secret-must-be-64-chars-or-longer-for-hmac-sha256-min-x",
            "dev-only-partner-jwt-secret-replace-in-prod-32bytes-min!!");

    private Environment environment;

    /** HMAC secret. Must be at least 32 bytes for HS256. */
    private String secret;

    /** Access-token lifetime in seconds. Default: 1 hour. */
    private long ttlSeconds = 3600;

    /**
     * Spring 이 주입한 활성 프로파일을 보관한다.
     *
     * <p>{@code @ConfigurationProperties} 바인딩과 충돌하지 않도록 생성자 주입 대신
     * {@link EnvironmentAware} 를 사용한다.
     */
    @Override
    public void setEnvironment(Environment environment) {
        this.environment = environment;
    }

    /**
     * JWT 검증 secret 부팅 가드.
     *
     * <p>운영 프로파일({@code prod}, {@code production})에서는 blank, 32 bytes 미만,
     * 공개된 개발 기본값을 모두 거부한다. 비운영에서는 로컬 개발 편의를 위해 경고만 남긴다.
     *
     * @throws IllegalStateException 운영 프로파일에서 안전하지 않은 secret 이 설정된 경우
     */
    @PostConstruct
    public void verify() {
        boolean unsafeSecret = isUnsafeSecret();
        if (isProductionProfile() && unsafeSecret) {
            throw new IllegalStateException(
                    "app.security.jwt.secret 은 운영 프로파일에서 비어 있거나, 32 bytes 미만이거나, "
                            + "공개된 dev 기본값일 수 없습니다. SAMHAN_JWT_SECRET 환경변수를 안전한 값으로 설정하세요.");
        }
        if (unsafeSecret) {
            log.warn("[보안] app.security.jwt.secret 이 비어 있거나 짧거나 공개된 dev 기본값입니다. "
                    + "비운영 환경이면 무시 가능하지만 배포 전 SAMHAN_JWT_SECRET 교체가 필요합니다.");
        }
    }

    public byte[] getSecretBytes() {
        return secret == null ? new byte[0] : secret.getBytes(StandardCharsets.UTF_8);
    }

    private boolean isProductionProfile() {
        return environment != null && Arrays.stream(environment.getActiveProfiles())
                .map(String::toLowerCase)
                .anyMatch(PROD_PROFILES::contains);
    }

    private boolean isUnsafeSecret() {
        return !StringUtils.hasText(secret)
                || getSecretBytes().length < 32
                || DEV_DEFAULT_SECRETS.contains(secret);
    }
}
