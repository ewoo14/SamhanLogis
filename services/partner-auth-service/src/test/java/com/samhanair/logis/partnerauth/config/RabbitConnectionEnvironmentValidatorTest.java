package com.samhanair.logis.partnerauth.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import org.junit.jupiter.api.Test;

class RabbitConnectionEnvironmentValidatorTest {

    @Test
    void rejectsUnresolvedRabbitEnvironmentPlaceholdersBeforeConnectionAttempt() {
        assertThatThrownBy(() -> RabbitConnectionEnvironmentValidator.validate(Map.of(
                "RABBIT_HOST", "${RABBIT_HOST}",
                "RABBIT_USER", "${RABBIT_USER}",
                "RABBIT_PASSWORD", "${RABBIT_PASSWORD}")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("RABBIT_");
    }

    @Test
    void acceptsResolvedRabbitEnvironment() {
        assertThatCode(() -> RabbitConnectionEnvironmentValidator.validate(Map.of(
                "RABBIT_HOST", "rabbitmq",
                "RABBIT_USER", "runtime-user",
                "RABBIT_PASSWORD", "runtime-password")))
                .doesNotThrowAnyException();
    }
}
