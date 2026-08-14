package com.samhanair.logis.slip.config;

import com.samhanair.logis.security.InternalTokenFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.boot.web.servlet.FilterRegistrationBean;

/**
 * Stateless servlet security: trusts gateway-injected X-User-* headers.
 *
 * <p>Slice B (notification-slice-B): {@code /public/**} 는 인증 우회 (no auth) — 공개 모바일
 * endpoint 가 토큰만 검증한다. API Gateway 의 {@code /api/public/**} 라우트도 동일하게
 * JwtAuthentication 필터 미적용 (Plan §4.2 + §8).
 *
 * <p>Phase 10 W10-4 DV-3 (PR #99): InternalTokenFilter 는 {@code shared:security} module 의 통합
 * 자동 설정 ({@link com.samhanair.logis.security.InternalSecurityAutoConfiguration}) 에서 bean 으로 등록 —
 * 본 클래스는 주입 받아 filter chain 에 명시 등록만.
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
                        // Slice B (notification-slice-B): 공개 모바일 endpoint — 토큰만 검증
                        .requestMatchers("/public/**").permitAll()
                        // 종합견적서(웹) 견적 저장/불러오기 — P0-A 하드닝(2026-06-10):
                        // 기존 무인증 permitAll(/api/v1/estimates/snapshots) → /internal/estimates/
                        // snapshots 이전 + X-Internal-Token(아래 /internal/** 규칙 적용). estimate-app
                        // server-to-server 호출(결정 ②, [[project_estimate_auth_dc_key_decisions]]).
                        // P0-B: /internal/** 는 X-Internal-Token 으로 인증된 system-internal
                        // principal 만 허용 — gateway 신뢰 모델의 X-User-* 헤더 위조로
                        // HeaderAuthenticationFilter 인증이 설정되어도 내부 게이트는 우회 불가.
                        .requestMatchers("/internal/**").access((authentication, context) ->
                                new org.springframework.security.authorization.AuthorizationDecision(
                                        authentication.get() != null
                                                && com.samhanair.logis.security.InternalTokenFilter.INTERNAL_PRINCIPAL
                                                        .equals(authentication.get().getName())))
                        .anyRequest().authenticated())
                // W10-4 (PR #99) DV-3: shared:security InternalTokenFilter 등록
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
