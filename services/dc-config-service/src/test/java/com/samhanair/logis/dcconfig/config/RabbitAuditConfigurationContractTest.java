package com.samhanair.logis.dcconfig.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class RabbitAuditConfigurationContractTest {

    @Test
    void dcConfigServiceRequiresRabbitConnectionFromEnvironment() throws IOException {
        String yaml = Files.readString(Path.of("src/main/resources/application.yml"), StandardCharsets.UTF_8);

        assertThat(yaml).contains("rabbitmq:", "host: ${RABBIT_HOST}",
                "port: ${RABBIT_PORT:5672}", "username: ${RABBIT_USER}", "password: ${RABBIT_PASSWORD}");
    }
}
