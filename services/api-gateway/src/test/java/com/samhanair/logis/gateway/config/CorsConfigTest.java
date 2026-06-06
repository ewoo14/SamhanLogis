package com.samhanair.logis.gateway.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.web.cors.CorsConfiguration;

/**
 * {@link CorsConfig} 계약 테스트.
 *
 * <p>C5 후속: SPA 가 읽어야 하는 identity 헤더(exposedHeaders) 계약을 박제 —
 * gateway 가 더 이상 주입하지 않는 {@code X-User-Role} 노출은 제거하고
 * {@code X-User-Groups} 를 유지한다.
 *
 * <p><b>리터럴 단언은 의도</b>: 상수({@code HttpHeaderConstants}) 참조가 아닌 와이어 포맷
 * 문자열 원문을 단언한다 — 상수 값이 실수로 변경되면(와이어 포맷 파괴) 본 테스트가 적발한다.
 * 상수 참조로 작성하면 상수 변경 시 테스트가 함께 통과해 변경 감지가 불가능하다.
 */
class CorsConfigTest {

    @Test
    @DisplayName("exposedHeaders — C5 후속 gateway identity 헤더 노출")
    void exposedHeaders_includeUserGroups() {
        CorsConfiguration config = CorsConfig.corsConfiguration();

        assertThat(config.getExposedHeaders()).containsExactlyInAnyOrder(
                "Authorization", "Content-Type",
                "X-User-Id", "X-User-Groups");
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
