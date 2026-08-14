package com.samhanair.logis.partnerauth.config;

import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Rabbit 연결 정보가 미해결 placeholder로 전달되지 않도록 검증한다. */
@Component
@Profile("!local")
public class RabbitConnectionEnvironmentValidator {

    public RabbitConnectionEnvironmentValidator(
            @Value("${spring.rabbitmq.host}") String host,
            @Value("${spring.rabbitmq.username}") String username,
            @Value("${spring.rabbitmq.password}") String password) {
        validate(Map.of("RABBIT_HOST", host, "RABBIT_USER", username, "RABBIT_PASSWORD", password));
    }

    public static void validate(Map<String, String> values) {
        values.forEach((name, value) -> {
            if (value == null || value.isBlank() || value.contains("${")) {
                throw new IllegalStateException(name + " must be provided as a resolved runtime secret");
            }
        });
    }
}
