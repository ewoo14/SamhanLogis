package com.samhanair.logis.auth.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

/**
 * {@link JwtIssueProperties} 운영 secret 부팅 가드 테스트.
 *
 * <p>auth-service 는 JWT 발급 주체이므로 production/prod 에서 blank, short, 공개 dev secret 을
 * 허용하면 토큰 위조 위험이 생긴다.
 */
class JwtIssuePropertiesTest {

    @Test
    @DisplayName("production 프로파일은 공개 dev JWT secret 부팅 거부")
    void productionProfile_rejectsDevDefaultSecret() {
        JwtIssueProperties properties = properties("production",
                "dev-secret-change-me-in-production-32bytes-min!");

        assertThatThrownBy(properties::verify)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SAMHAN_JWT_SECRET");
    }

    @Test
    @DisplayName("prod 프로파일은 blank/short JWT secret 부팅 거부")
    void prodProfile_rejectsBlankOrShortSecret() {
        assertThatThrownBy(properties("prod", "")::verify)
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(properties("prod", "short-secret")::verify)
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("비운영 프로파일은 dev JWT secret 경고만 기록")
    void nonProductionProfile_warnsOnly() {
        JwtIssueProperties properties = properties("local",
                "dev-secret-change-me-in-production-32bytes-min!");

        assertThatCode(properties::verify).doesNotThrowAnyException();
    }

    private static JwtIssueProperties properties(String profile, String secret) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(profile);
        JwtIssueProperties properties = new JwtIssueProperties();
        properties.setEnvironment(environment);
        properties.setSecret(secret);
        return properties;
    }
}
