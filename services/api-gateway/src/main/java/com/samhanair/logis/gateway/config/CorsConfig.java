package com.samhanair.logis.gateway.config;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import java.time.Duration;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

/**
 * Global reactive CORS filter mounted on the gateway.
 *
 * <p>Exposes {@code Authorization}, {@code X-User-Id}, {@code X-User-Role},
 * and {@code X-User-Groups} (Phase C5-1) so the SPA can read identity headers
 * that downstream services attach. Allowed origins follow the project_plan §4 domain matrix:
 * three production sub-domains under samhan-air.com plus local-dev Vite ports
 * (3000 / 3001 / 3002 — web SPA, 5173 — electron-vite default).
 *
 * <h2>Electron 데스크톱 호환</h2>
 * <p>Electron 프로덕션 빌드는 렌더러를 file:// 또는 app:// 프로토콜로
 * 로드하기 때문에 단일 origin 문자열 매칭(allowedOrigins)으로는 잡히지 않는다.
 * 본 설정은 {@code allowedOriginPatterns} 를 함께 사용하여
 * {@code file://}, {@code app://com.samhanair.logis.desktop} 등 패턴 origin
 * 도 허용한다. {@code allowCredentials=true} 와 와일드카드 origin 은
 * 함께 쓸 수 없으므로 명시적 패턴만 등록한다.
 */
@Configuration
public class CorsConfig {

    @Bean
    public CorsWebFilter corsWebFilter() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", corsConfiguration());
        return new CorsWebFilter(source);
    }

    /**
     * CORS 설정 구성 — 테스트에서 exposedHeaders 등 계약 검증을 위해 분리.
     */
    static CorsConfiguration corsConfiguration() {
        CorsConfiguration config = new CorsConfiguration();
        // 프로덕션 웹 + 로컬 dev 웹 origin (정확 매칭)
        config.setAllowedOrigins(List.of(
                "https://app.samhan-air.com",
                "https://order.samhan-air.com",
                "https://sign.samhan-air.com",
                "http://localhost:3000",
                "http://localhost:3001",
                "http://localhost:3002",
                "http://localhost:5173"
        ));
        // Electron / 패턴 origin (file://, app://, dev 동적 포트)
        config.setAllowedOriginPatterns(List.of(
                "http://localhost:*",
                "http://127.0.0.1:*",
                "app://com.samhanair.logis.desktop",
                "app://*.samhanair.logis.desktop",
                "file://*"
        ));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        // C5-1 P2: X-User-Groups 노출 추가(C5-2 cutover 시 SPA 가 그룹 집합 수신 가능 선행 준비)
        // + identity 헤더 이름 shared HttpHeaderConstants 단일 출처 통일.
        config.setExposedHeaders(List.of(
                "Authorization", "Content-Type",
                HttpHeaderConstants.CALLER_ID_HEADER,
                HttpHeaderConstants.CALLER_ROLE_HEADER,
                HttpHeaderConstants.USER_GROUPS_HEADER));
        config.setAllowCredentials(true);
        config.setMaxAge(Duration.ofSeconds(3600));
        return config;
    }
}
