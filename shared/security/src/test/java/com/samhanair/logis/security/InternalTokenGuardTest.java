package com.samhanair.logis.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

/** shared:security InternalTokenGuard 단위 테스트 — Phase 10 W10-4 (PR #99) DV-3 채택. */
class InternalTokenGuardTest {

    @Test
    void prodProfile_withDevDefault_throwsAndRefusesBoot() {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(InternalTokenGuard.DEV_DEFAULT);
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("prod");

        InternalTokenGuard guard = new InternalTokenGuard(props, env);

        assertThatThrownBy(guard::verify)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("INTERNAL_AUTH_TOKEN")
                .hasMessageContaining("prod");
    }

    @Test
    void productionProfile_withDevDefault_throwsAndRefusesBoot() {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(InternalTokenGuard.DEV_DEFAULT);
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("production");

        InternalTokenGuard guard = new InternalTokenGuard(props, env);

        assertThatThrownBy(guard::verify)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("INTERNAL_AUTH_TOKEN");
    }

    @Test
    void prodProfile_withCustomToken_doesNotThrow() {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken("super-secret-rotated-token-2026");
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("prod");

        InternalTokenGuard guard = new InternalTokenGuard(props, env);

        guard.verify();
        assertThat(props.getToken()).doesNotContain("dev-");
    }

    @Test
    void devProfile_withDevDefault_doesNotThrow_butLogsWarning() {
        InternalAuthProperties props = new InternalAuthProperties();
        props.setToken(InternalTokenGuard.DEV_DEFAULT);
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("local");

        InternalTokenGuard guard = new InternalTokenGuard(props, env);

        guard.verify();
    }
}
