package com.samhanair.logis.auth.claude;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class ClaudeVirtualAgentPropertiesTest {

    @Test
    void virtualAgentIsDisabledByDefault() {
        var properties = new ClaudeVirtualAgentProperties();
        assertThat(properties.isEnabled()).isFalse();
    }

    @Test
    void productionProfileCannotEnableVirtualAgent() {
        var properties = new ClaudeVirtualAgentProperties();
        properties.setEnabled(true);
        var environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        properties.setEnvironment(environment);

        assertThatThrownBy(properties::verify)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("가상 에이전트")
                .hasMessageContaining("운영");
    }
}
