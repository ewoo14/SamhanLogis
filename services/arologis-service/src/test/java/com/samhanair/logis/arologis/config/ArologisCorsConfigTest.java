package com.samhanair.logis.arologis.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.DefaultCorsProcessor;

class ArologisCorsConfigTest {

    @Test
    @DisplayName("실제 CORS processor가 사본 발송 결과 헤더를 교차 출처 브라우저에 공개한다")
    void copyResultHeaders_areExposedByActualCorsProcessor() throws Exception {
        Method method = SecurityConfig.class.getDeclaredMethod("corsConfigurationSource");
        method.setAccessible(true);
        CorsConfigurationSource source = (CorsConfigurationSource) method.invoke(new SecurityConfig());
        CorsConfiguration config = source.getCorsConfiguration(request());

        MockHttpServletResponse response = new MockHttpServletResponse();
        response.setHeader("X-Copy-Sent-At", "2026-07-23T10:20:30");
        response.setHeader("X-Copy-Recipient-Phone-Masked", "010-****-5678");

        boolean accepted = new DefaultCorsProcessor().processRequest(config, request(), response);

        assertThat(accepted).isTrue();
        assertThat(response.getHeader(HttpHeaders.ACCESS_CONTROL_EXPOSE_HEADERS))
                .contains("X-Copy-Sent-At")
                .contains("X-Copy-Recipient-Phone-Masked");
    }

    private MockHttpServletRequest request() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/driver-app/arologis/sign-and-send-copy");
        request.addHeader(HttpHeaders.ORIGIN, "http://localhost:5173");
        return request;
    }
}
