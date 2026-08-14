package com.samhanair.logis.partnerorder.config;

import com.samhanair.logis.security.InternalTokenFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Stateless servlet security. 두 종류의 인증 진입점:
 * <ul>
 *   <li>{@link InternalTokenFilter} — X-Internal-Token 헤더 (형제 서비스 / admin)</li>
 *   <li>{@link HeaderAuthenticationFilter} — X-User-Id/X-User-Role (gateway 경유 일반 사용자)</li>
 * </ul>
 *
 * <p>{@code /api/v1/partner-orders/log} 는 silent fail 가드를 위해 익명 호출도 허용.
 * 그 외 endpoint 는 인증 필수.
 *
 * <p>{@code /api/v1/partner-orders/bootstrap} + {@code /gate-images} 는 mobile-gate 진입 직전
 * (로그인 전) 에도 호출되므로 익명 허용 (legacy 동작 보존).
 *
 * <p>Phase 10 W10-4 DV-3 (PR #99): InternalTokenFilter 는 {@code shared:security} module 통합 자동 설정에서 주입.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, InternalTokenFilter internalTokenFilter,
            PublicIdentityHeaderSanitizingFilter publicIdentityHeaderSanitizingFilter,
            HeaderAuthenticationFilter headerAuthenticationFilter)
            throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        // legacy 동작 — 로그인 전 mobile-gate 진입 prefetch
                        .requestMatchers("/api/v1/partner-orders/gate-images").permitAll()
                        .requestMatchers("/api/v1/partner-orders/bootstrap").permitAll()
                        // legacy logFrontEvent silent fail
                        .requestMatchers("/api/v1/partner-orders/log").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(internalTokenFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(publicIdentityHeaderSanitizingFilter, InternalTokenFilter.class)
                .addFilterBefore(headerAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PublicIdentityHeaderSanitizingFilter publicIdentityHeaderSanitizingFilter() {
        return new PublicIdentityHeaderSanitizingFilter();
    }

    @Bean
    public HeaderAuthenticationFilter headerAuthenticationFilter(
            @Value("${SAMHAN_GATEWAY_ATTESTATION:}") String gatewayAttestation) {
        return new HeaderAuthenticationFilter(gatewayAttestation);
    }

    @Bean
    public FilterRegistrationBean<HeaderAuthenticationFilter> headerAuthenticationFilterRegistration(
            HeaderAuthenticationFilter filter) {
        var registration = new FilterRegistrationBean<HeaderAuthenticationFilter>(filter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    public FilterRegistrationBean<PublicIdentityHeaderSanitizingFilter> publicIdentityHeaderSanitizingFilterRegistration(
            PublicIdentityHeaderSanitizingFilter filter) {
        var registration = new FilterRegistrationBean<PublicIdentityHeaderSanitizingFilter>(filter);
        registration.setEnabled(false);
        return registration;
    }
}
