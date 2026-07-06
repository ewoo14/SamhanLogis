package com.samhanair.logis.gateway.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

/**
 * {@link JwtProperties} 운영 secret 부팅 가드 테스트.
 *
 * <p>production 프로파일에서 공개 dev secret, blank, 32 bytes 미만 secret 이 gateway 검증키로
 * 들어오면 앱이 뜨지 않아야 한다.
 */
class JwtPropertiesTest {

    @Test
    @DisplayName("production 프로파일은 공개 dev JWT secret 부팅 거부")
    void productionProfile_rejectsDevDefaultSecret() {
        JwtProperties properties = properties("production",
                "dev-secret-change-me-in-production-32bytes-min!");

        assertThatThrownBy(properties::verify)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SAMHAN_JWT_SECRET");
    }

    @Test
    @DisplayName("production 프로파일은 blank/short JWT secret 부팅 거부")
    void productionProfile_rejectsBlankOrShortSecret() {
        assertThatThrownBy(properties("production", "")::verify)
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(properties("prod", "short-secret")::verify)
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("비운영 프로파일은 dev JWT secret 경고만 기록")
    void nonProductionProfile_warnsOnly() {
        JwtProperties properties = properties("local",
                "dev-secret-change-me-in-production-32bytes-min!");

        assertThatCode(properties::verify).doesNotThrowAnyException();
    }

    private static JwtProperties properties(String profile, String secret) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(profile);
        JwtProperties properties = new JwtProperties();
        properties.setEnvironment(environment);
        properties.setSecret(secret);
        return properties;
    }
}
