package com.samhanair.logis.partnerauth.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

/**
 * {@link PartnerAuthJwtProperties} 운영 secret 부팅 가드 테스트.
 *
 * <p>partner-auth-service 의 파트너 JWT 발급키가 production/prod 에서 공개 dev secret 이거나
 * 최소 길이 미만이면 부팅을 중단해야 한다.
 */
class PartnerAuthJwtPropertiesTest {

    @Test
    @DisplayName("production 프로파일은 공개 partner JWT dev secret 부팅 거부")
    void productionProfile_rejectsDevDefaultSecret() {
        PartnerAuthJwtProperties properties = properties("production",
                "dev-only-partner-jwt-secret-replace-in-prod-32bytes-min!!");

        assertThatThrownBy(properties::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("SAMHAN_JWT_SECRET");
    }

    @Test
    @DisplayName("prod 프로파일은 blank/short partner JWT secret 부팅 거부")
    void prodProfile_rejectsBlankOrShortSecret() {
        assertThatThrownBy(properties("prod", "")::validate)
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(properties("prod", "short-secret")::validate)
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    @DisplayName("비운영 프로파일은 partner dev JWT secret 경고만 기록")
    void nonProductionProfile_warnsOnly() {
        PartnerAuthJwtProperties properties = properties("local",
                "dev-only-partner-jwt-secret-replace-in-prod-32bytes-min!!");

        assertThatCode(properties::validate).doesNotThrowAnyException();
    }

    private static PartnerAuthJwtProperties properties(String profile, String secret) {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles(profile);
        PartnerAuthJwtProperties properties = new PartnerAuthJwtProperties();
        properties.setEnvironment(environment);
        properties.setSecret(secret);
        return properties;
    }
}
