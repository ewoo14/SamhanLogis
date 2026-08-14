package com.samhanair.logis.arologis.config;

import com.samhanair.logis.security.InternalTokenFilter;
import jakarta.servlet.http.HttpServletResponse;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.boot.web.servlet.FilterRegistrationBean;

/**
 * Stateless servlet security — Phase 10 W10-1 arologis-service.
 *
 * <p>partner-service / dashboard-service 와 동일한 2단 filter chain (InternalTokenFilter +
 * HeaderAuthenticationFilter). actuator / swagger 공개.
 *
 * <p>Phase 10 W10-4 DV-3 (PR #99): InternalTokenFilter 는 {@code shared:security} module 통합 자동 설정에서 주입.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   InternalTokenFilter internalTokenFilter,
                                                   ArologisJwtFilter arologisJwtFilter,
                                                   PublicIdentityHeaderSanitizingFilter publicIdentityHeaderSanitizingFilter,
                                                   @Value("${samhan.security.gateway-attestation:}") String gatewayAttestation,
                                                   @Value("${samhan.security.gateway-attestation-enforcement:true}") boolean enforceAttestation)
            throws Exception {
        if (enforceAttestation && (gatewayAttestation == null || gatewayAttestation.isBlank())) throw new IllegalStateException("SAMHAN_GATEWAY_ATTESTATION is required when gateway attestation enforcement is enabled");
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(exceptions -> exceptions.authenticationEntryPoint(
                        (request, response, exception) -> response.sendError(HttpServletResponse.SC_UNAUTHORIZED)))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        // 2026-05-14 분리 — 자체 auth endpoint (login 은 인증 전 진입).
                        .requestMatchers("/auth/admin/login", "/auth/driver/login", "/auth/refresh").permitAll()
                        // 내부 RPC 는 X-Internal-Token 으로 인증된 system-internal principal 만 허용한다.
                        .requestMatchers("/internal/**").access((authentication, context) ->
                                new org.springframework.security.authorization.AuthorizationDecision(
                                        authentication.get() != null
                                                && InternalTokenFilter.INTERNAL_PRINCIPAL
                                                        .equals(authentication.get().getName())))
                        .anyRequest().authenticated())
                .addFilterBefore(internalTokenFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(publicIdentityHeaderSanitizingFilter, InternalTokenFilter.class)
                // 2026-05-14 — Bearer JWT 자체 검증 (gateway 우회 직접 호출 대응). InternalToken 다음.
                .addFilterAfter(arologisJwtFilter, InternalTokenFilter.class)
                .addFilterAfter(new HeaderAuthenticationFilter(gatewayAttestation, enforceAttestation), ArologisJwtFilter.class);
        return http.build();
    }

    @Bean public PublicIdentityHeaderSanitizingFilter publicIdentityHeaderSanitizingFilter() { return new PublicIdentityHeaderSanitizingFilter(); }
    @Bean public FilterRegistrationBean<PublicIdentityHeaderSanitizingFilter> publicIdentityHeaderSanitizingFilterRegistration(PublicIdentityHeaderSanitizingFilter f) { var r = new FilterRegistrationBean<PublicIdentityHeaderSanitizingFilter>(f); r.setEnabled(false); return r; }

    /**
     * BCrypt strength 10 — 2026-05-14 분리 (AdminLoginService 의존).
     * auth-service / partner-auth-service 와 동일 strength.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10);
    }

    /**
     * Servlet CORS — arologis-desktop / arologis-mobile 이 gateway 우회 직접 호출(:8097) 지원.
     *
     * <p>게이트웨이 미경유·자체 auth 로 동작하는 아로로지스 독립 운영 단위 전용 정책이다.
     * Samhan Public gateway 의 {@code X-User-Groups} 노출 정책을 복제하지 않으며,
     * exposedHeaders 의 {@code X-User-Role} 은 아로로지스 자체 JWT role 시맨틱 호환을 위해 유지한다.
     */
    private CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(List.of(
                "http://localhost:*",
                "http://127.0.0.1:*",
                "app://com.samhanair.logis.arologis-desktop",
                "app://*.arologis-desktop",
                "file://*"
        ));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of(
                "Authorization",
                "Content-Type",
                "Accept",
                "Origin",
                "Cache-Control",
                "Pragma",
                "X-Requested-With"
        ));
        config.setExposedHeaders(List.of(
                "Authorization",
                "Content-Type",
                "X-User-Id",
                "X-User-Role",
                "X-Copy-Sent-At",
                "X-Copy-Recipient-Phone-Masked"
        ));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
