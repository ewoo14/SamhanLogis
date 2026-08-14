package com.samhanair.logis.user.config;

import com.samhanair.logis.security.InternalTokenFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Stateless servlet security: trusts gateway-injected X-User-* headers + Phase 9 W3 신규 InternalTokenFilter
 * ({@code /internal/**} prefix 한정, X-Internal-Token 인증).
 *
 * <p>Phase 10 W10-4 DV-3 (PR #99): InternalTokenFilter 는 {@code shared:security} module 통합 자동 설정에서 주입.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, InternalTokenFilter internalTokenFilter,
                                                   HeaderAuthenticationFilter headerAuthenticationFilter,
                                                   PublicIdentityHeaderSanitizingFilter publicIdentityHeaderSanitizingFilter)
            throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/**").permitAll()
                        // C1b: 공개 서명 제출은 NO-AUTH 토큰 게이트. Gateway 가 inbound identity 헤더를 strip 하고,
                        // downstream 은 X-User-* 가 아닌 handoff token 만 신뢰한다.
                        .requestMatchers("/public/**").permitAll()
                        // P0-B: /internal/** 는 X-Internal-Token system-internal principal 만 — X-User-* 위조 우회 차단
                        .requestMatchers("/internal/**").access((authentication, context) ->
                                new org.springframework.security.authorization.AuthorizationDecision(
                                        authentication.get() != null
                                                && com.samhanair.logis.security.InternalTokenFilter.INTERNAL_PRINCIPAL
                                                        .equals(authentication.get().getName())))
                        .anyRequest().authenticated())
                .addFilterBefore(internalTokenFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(publicIdentityHeaderSanitizingFilter, InternalTokenFilter.class)
                .addFilterAfter(headerAuthenticationFilter, InternalTokenFilter.class);
        return http.build();
    }

    @Bean
    public HeaderAuthenticationFilter headerAuthenticationFilter(
            @Value("${SAMHAN_GATEWAY_ATTESTATION:}") String gatewayAttestation,
            @Value("${samhan.security.gateway-attestation-enforcement:true}") boolean enforceAttestation) {
        requireGatewayAttestation(gatewayAttestation, enforceAttestation);
        return new HeaderAuthenticationFilter(gatewayAttestation, enforceAttestation);
    }

    @Bean
    public PublicIdentityHeaderSanitizingFilter publicIdentityHeaderSanitizingFilter() {
        return new PublicIdentityHeaderSanitizingFilter();
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

    private void requireGatewayAttestation(String value, boolean enforcementEnabled) {
        if (enforcementEnabled && (value == null || value.isBlank())) {
            throw new IllegalStateException("SAMHAN_GATEWAY_ATTESTATION is required when gateway attestation enforcement is enabled");
        }
    }
}
