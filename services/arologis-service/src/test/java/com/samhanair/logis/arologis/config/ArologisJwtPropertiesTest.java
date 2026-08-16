package com.samhanair.logis.arologis.config;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

/**
 * {@link ArologisJwtProperties} 독립 JWT secret 부팅 가드 테스트.
 *
 * <p>아로로지스 독립 배포는 {@code production} 프로파일을 사용하므로 공개 dev secret 과
 * 미설정 secret 을 시작 시점에 차단해야 한다.
 */
class ArologisJwtPropertiesTest {

    @Test
    @DisplayName("production 프로파일은 공개 아로로지스 JWT dev secret 부팅 거부")
    void productionProfile_rejectsDevDefaultSecret() {
        ArologisJwtProperties properties = properties("production",
                "short-secret");

        assertThatThrownBy(properties::verify)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SAMHAN_AROLOGIS_JWT_SECRET");
    }

    @Test
    @DisplayName("prod 프로파일은 blank/short 아로로지스 JWT secret 부팅 거부")
    void prodProfile_rejectsBlankOrShortSecret() {
        assertThatThrownBy(properties("prod", "")::verify)
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(properties("prod", "short-secret")::verify)
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("비운영 프로파일도 아로로지스 JWT secret 미설정/공개값을 부팅 거부")
    void nonProductionProfile_rejectsUnsafeSecret() {
        ArologisJwtProperties properties = properties("local",
                "short-secret");

        assertThatThrownBy(properties::verify)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SAMHAN_AROLOGIS_JWT_SECRET");
    }

    private static ArologisJwtProperties properties(String profile, String secret) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(profile);
        ArologisJwtProperties properties = new ArologisJwtProperties();
        properties.setEnvironment(environment);
        properties.setSecret(secret);
        return properties;
    }
}
