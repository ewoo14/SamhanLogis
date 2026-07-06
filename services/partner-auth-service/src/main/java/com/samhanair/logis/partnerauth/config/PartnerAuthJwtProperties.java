package com.samhanair.logis.partnerauth.config;

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
 * 파트너 JWT 발급 설정 ({@code samhan.jwt.*}).
 *
 * <p>shared:common 의 {@link com.samhanair.logis.common.security.JwtTokenProvider} 와
 * 동일 HS256 시크릿 / TTL 모델을 사용한다.
 */
@Getter
@Setter
@Slf4j
@ConfigurationProperties(prefix = "samhan.jwt")
public class PartnerAuthJwtProperties implements EnvironmentAware {

    /** 운영 프로파일 별칭. production 배포에서도 dev secret 사용을 차단한다. */
    private static final Set<String> PROD_PROFILES = Set.of("prod", "production");

    /** 저장소에 노출된 개발용 JWT secret. 운영 파트너 JWT 발급키로 사용할 수 없다. */
    private static final Set<String> DEV_DEFAULT_SECRETS = Set.of(
            "dev-secret-change-me-in-production-32bytes-min!",
            "dev-only-secret-must-be-64-chars-or-longer-for-hmac-sha256-min-x",
            "dev-only-partner-jwt-secret-replace-in-prod-32bytes-min!!");

    private Environment environment;

    /** HS256 시크릿. dev-only 기본값은 운영 배포 시 반드시 override. */
    private String secret = "";

    /** 토큰 만료(시간). 설계서 W3 정정 예정 — 현 구현은 8시간. */
    private int expirationHours = 8;

    public byte[] getSecretBytes() {
        return secret == null ? new byte[0] : secret.getBytes(StandardCharsets.UTF_8);
    }

    public int getExpirationSeconds() {
        return expirationHours * 3600;
    }

    /**
     * Spring 활성 프로파일을 부팅 가드에서 사용한다.
     *
     * <p>{@code @ConfigurationProperties} 바인딩과 충돌하지 않도록 생성자 주입 대신
     * {@link EnvironmentAware} 로 받는다.
     */
    @Override
    public void setEnvironment(Environment environment) {
        this.environment = environment;
    }

    /**
     * 파트너 JWT secret 부팅 가드.
     *
     * <p>운영 프로파일에서는 blank, 32 bytes 미만, 공개된 dev 기본값을 부팅 실패로
     * 처리한다. 비운영은 로컬 compose 의 dev secret 허용을 위해 경고만 남긴다.
     *
     * @throws IllegalStateException 운영 프로파일에서 안전하지 않은 secret 이 설정된 경우
     */
    @PostConstruct
    public void validate() {
        boolean unsafeSecret = isUnsafeSecret();
        if (isProductionProfile() && unsafeSecret) {
            throw new IllegalStateException(
                    "samhan.jwt.secret 은 운영 프로파일에서 비어 있거나, 32 bytes 미만이거나, "
                            + "공개된 dev 기본값일 수 없습니다. SAMHAN_JWT_SECRET 환경변수를 안전한 값으로 설정하세요.");
        }
        if (unsafeSecret) {
            log.warn("[보안] samhan.jwt.secret 이 비어 있거나 짧거나 공개된 dev 기본값입니다. "
                    + "비운영 환경이면 무시 가능하지만 배포 전 SAMHAN_JWT_SECRET 교체가 필요합니다.");
        }
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
