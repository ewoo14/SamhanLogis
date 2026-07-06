package com.samhanair.logis.auth.config;

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

/** External configuration for JWT issuance ({@code app.security.jwt.*}). */
@Data
@Slf4j
@ConfigurationProperties(prefix = "app.security.jwt")
public class JwtIssueProperties implements EnvironmentAware {

    /** 운영 프로파일 별칭. production 배포에서도 dev secret 을 동일하게 차단한다. */
    private static final Set<String> PROD_PROFILES = Set.of("prod", "production");

    /** 저장소에 노출된 개발용 JWT secret. 운영 발급키로 사용하면 안 된다. */
    private static final Set<String> DEV_DEFAULT_SECRETS = Set.of(
            "dev-secret-change-me-in-production-32bytes-min!",
            "dev-only-secret-must-be-64-chars-or-longer-for-hmac-sha256-min-x",
            "dev-only-partner-jwt-secret-replace-in-prod-32bytes-min!!");

    private Environment environment;

    private String secret;
    private long ttlSeconds;

    /**
     * Spring 활성 프로파일을 부팅 가드에서 사용한다.
     *
     * <p>{@code @ConfigurationProperties} 기본 바인딩을 유지하기 위해 생성자 주입 대신
     * {@link EnvironmentAware} 로 받는다.
     */
    @Override
    public void setEnvironment(Environment environment) {
        this.environment = environment;
    }

    /**
     * JWT 발급 secret 부팅 가드.
     *
     * <p>운영 프로파일에서는 blank, 32 bytes 미만, 공개된 dev 기본값을 모두 부팅 실패로
     * 처리한다. 비운영은 개발 편의를 위해 경고만 기록한다.
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
