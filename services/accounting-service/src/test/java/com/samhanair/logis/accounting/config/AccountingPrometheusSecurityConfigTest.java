package com.samhanair.logis.accounting.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

/** accounting-service Prometheus actuator 의 내부 토큰 가드 회귀 테스트. */
class AccountingPrometheusSecurityConfigTest {

    @Test
    void prometheus_endpoint_is_internal_token_guarded() throws IOException {
        String source = Files.readString(Path.of(
                "src/main/java/com/samhanair/logis/accounting/config/SecurityConfig.java"));

        assertThat(source)
                .contains("InternalTokenFilter")
                .contains(".requestMatchers(\"/actuator/prometheus\").hasRole(\"MASTER\")")
                .contains(".addFilterBefore(internalTokenFilter, UsernamePasswordAuthenticationFilter.class)");
    }
}
