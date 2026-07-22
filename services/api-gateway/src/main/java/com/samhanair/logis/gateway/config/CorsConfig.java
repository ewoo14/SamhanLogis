package com.samhanair.logis.gateway.config;

import com.samhanair.logis.common.http.HttpHeaderConstants;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

/**
 * Global reactive CORS filter mounted on the gateway.
 *
 * <p>Exposes {@code Authorization}, {@code Content-Type}, {@code X-User-Id},
 * {@code X-User-Groups}, and the inbox pagination metadata header so the SPA can
 * read gateway identity and response metadata. C5 후속 정리에서
 * gateway 가 더 이상 주입하지 않는 {@code X-User-Role} 은 exposed header 에서 제거했다.
 * Allowed origins follow the project_plan §4 domain matrix:
 * three production sub-domains under samhan-air.com, with local-dev Vite ports
 * enabled only outside prod/production profiles.
 *
 * <h2>Electron 데스크톱 호환</h2>
 * <p>Electron 프로덕션 빌드는 렌더러를 app:// 프로토콜로
 * 로드하기 때문에 단일 origin 문자열 매칭(allowedOrigins)으로는 잡히지 않는다.
 * 본 설정은 {@code allowedOriginPatterns} 를 함께 사용하여
 * {@code app://com.samhanair.logis.desktop} 등 패턴 origin 도 허용한다.
 * {@code file://} 는 개발 편의용이므로 비운영에서만 허용한다.
 * {@code allowCredentials=true} 와 와일드카드 origin 은 함께 쓸 수 없으므로
 * 명시적 패턴만 등록한다.
 */
@Configuration
public class CorsConfig {

    /** 운영 프로파일 별칭. production 배포에서는 개발 origin 패턴을 허용하지 않는다. */
    private static final Set<String> PROD_PROFILES = Set.of("prod", "production");

    private final Environment environment;

    public CorsConfig(Environment environment) {
        this.environment = environment;
    }

    @Bean
    public CorsWebFilter corsWebFilter() {
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", corsConfiguration(environment));
        return new CorsWebFilter(source);
    }

    /**
     * CORS 설정 구성 — 테스트에서 exposedHeaders 등 계약 검증을 위해 분리.
     */
    static CorsConfiguration corsConfiguration() {
        return corsConfiguration(new String[0]);
    }

    /**
     * 활성 프로파일 기반 CORS 설정 구성.
     *
     * <p>운영({@code prod}, {@code production})에서는 samhan-air.com 명시 origin 과
     * Electron {@code app://} 스킴만 허용한다. localhost, 127.0.0.1, file:// 패턴은
     * 개발 편의용이므로 비운영 프로파일에서만 추가한다.
     */
    static CorsConfiguration corsConfiguration(Environment environment) {
        return corsConfiguration(environment == null ? new String[0] : environment.getActiveProfiles());
    }

    static CorsConfiguration corsConfiguration(String... activeProfiles) {
        CorsConfiguration config = new CorsConfiguration();
        boolean isProd = Arrays.stream(activeProfiles)
                .map(String::toLowerCase)
                .anyMatch(PROD_PROFILES::contains);

        // 프로덕션 웹 origin 은 모든 환경에서 유지하고, 로컬 dev 웹 origin 은 비운영에서만 추가한다.
        List<String> allowedOrigins = new ArrayList<>(List.of(
                "https://app.samhan-air.com",
                "https://order.samhan-air.com",
                "https://sign.samhan-air.com"
        ));
        if (!isProd) {
            allowedOrigins.addAll(List.of(
                "http://localhost:3000",
                "http://localhost:3001",
                "http://localhost:3002",
                "http://localhost:5173",
                "http://localhost:5175"
            ));
        }
        config.setAllowedOrigins(allowedOrigins);

        // Electron app:// 은 운영 허용, localhost/127/file 패턴은 개발 전용으로 제한한다.
        List<String> allowedOriginPatterns = new ArrayList<>(List.of(
                "app://com.samhanair.logis.desktop",
                "app://*.samhanair.logis.desktop"
        ));
        if (!isProd) {
            allowedOriginPatterns.addAll(List.of(
                "http://localhost:*",
                "http://127.0.0.1:*",
                "file://*"
            ));
        }
        config.setAllowedOriginPatterns(allowedOriginPatterns);
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        // C5 후속: role 헤더는 gateway 주입이 제거되어 노출하지 않는다. 그룹 identity 만 유지.
        config.setExposedHeaders(List.of(
                "Authorization", "Content-Type",
                HttpHeaderConstants.CALLER_ID_HEADER,
                HttpHeaderConstants.USER_GROUPS_HEADER,
                "X-Has-Next-Page"));
        config.setAllowCredentials(true);
        config.setMaxAge(Duration.ofSeconds(3600));
        return config;
    }
}
