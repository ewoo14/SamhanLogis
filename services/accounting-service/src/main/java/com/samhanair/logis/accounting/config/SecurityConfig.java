package com.samhanair.logis.accounting.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
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
 * Slice A 본 슬라이스는 공개 endpoint 없음 — 모든 요청 인증 필수.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            InternalTokenFilter internalTokenFilter,
            InternalAuthProperties internalAuthProperties,
            ObjectMapper objectMapper,
            PublicIdentityHeaderSanitizingFilter publicIdentityHeaderSanitizingFilter,
            HeaderAuthenticationFilter headerAuthenticationFilter)
            throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/prometheus").authenticated()
                        .requestMatchers("/actuator/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/internal/**").access((authentication, context) ->
                                new org.springframework.security.authorization.AuthorizationDecision(
                                        authentication.get() != null
                                                && com.samhanair.logis.security.InternalTokenFilter.INTERNAL_PRINCIPAL
                                                        .equals(authentication.get().getName())))
                        .anyRequest().authenticated())
                .addFilterBefore(new AccountingInternalTokenFilter(internalAuthProperties),
                        UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(internalTokenFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(publicIdentityHeaderSanitizingFilter, InternalTokenFilter.class)
                .addFilterAfter(headerAuthenticationFilter, InternalTokenFilter.class);
        return http.build();
    }

    @Bean
    public PublicIdentityHeaderSanitizingFilter publicIdentityHeaderSanitizingFilter() {
        return new PublicIdentityHeaderSanitizingFilter();
    }

    @Bean
    public HeaderAuthenticationFilter headerAuthenticationFilter(
            ObjectMapper objectMapper, @Value("${SAMHAN_GATEWAY_ATTESTATION:}") String gatewayAttestation,
            @Value("${samhan.security.gateway-attestation-enforcement:true}") boolean enforceAttestation) {
        requireGatewayAttestation(gatewayAttestation, enforceAttestation);
        return new HeaderAuthenticationFilter(objectMapper, gatewayAttestation, enforceAttestation);
    }

    private void requireGatewayAttestation(String value, boolean enforcementEnabled) {
        if (enforcementEnabled && (value == null || value.isBlank())) {
            throw new IllegalStateException("SAMHAN_GATEWAY_ATTESTATION is required when gateway attestation enforcement is enabled");
        }
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
