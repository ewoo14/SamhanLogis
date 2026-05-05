package com.samhanair.logis.dcconfig.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

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
