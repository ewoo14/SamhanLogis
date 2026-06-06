package com.samhanair.logis.gateway.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.cors.CorsConfiguration;

/**
 * {@link CorsConfig} 계약 테스트.
 *
 * <p>C5-1 P2: SPA 가 읽어야 하는 identity 헤더(exposedHeaders) 계약을 박제 —
 * {@code X-User-Groups}(Phase C5-1) 포함, 기존 헤더 회귀 0 보장.
 */
class CorsConfigTest {

    @Test
    @DisplayName("exposedHeaders — 기존 4종 + X-User-Groups(C5-1) 노출")
    void exposedHeaders_includeUserGroups() {
        CorsConfiguration config = CorsConfig.corsConfiguration();

        assertThat(config.getExposedHeaders()).containsExactlyInAnyOrder(
                "Authorization", "Content-Type",
                "X-User-Id", "X-User-Role", "X-User-Groups");
    }

    @Test
    @DisplayName("기존 CORS 계약 불변 — credentials/메서드/origin")
    void existingContract_unchanged() {
        CorsConfiguration config = CorsConfig.corsConfiguration();

        assertThat(config.getAllowCredentials()).isTrue();
        assertThat(config.getAllowedMethods())
                .containsExactlyInAnyOrder("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS");
        assertThat(config.getAllowedOrigins()).contains("https://app.samhan-air.com");
        assertThat(config.getAllowedOriginPatterns()).contains("app://com.samhanair.logis.desktop");
    }
}
