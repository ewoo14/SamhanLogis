package com.samhanair.logis.dashboard.config;

import com.samhanair.logis.security.InternalTokenFilter;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Stateless servlet security. partner-service / groupware-service / notification-service 와 동일한
 * 2단 filter chain (InternalTokenFilter + HeaderAuthenticationFilter).
 *
 * <p>Phase 10 W10-4 DV-3 (PR #99): InternalTokenFilter 는 {@code shared:security} module 통합 자동 설정에서 주입.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            InternalTokenFilter internalTokenFilter,
            PublicIdentityHeaderSanitizingFilter publicIdentityHeaderSanitizingFilter,
            HeaderAuthenticationFilter headerAuthenticationFilter)
            throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(exceptions -> exceptions.authenticationEntryPoint(
                        (request, response, exception) -> response.sendError(
                                request.getRequestURI().startsWith("/internal/")
                                        ? HttpServletResponse.SC_FORBIDDEN
                                        : HttpServletResponse.SC_UNAUTHORIZED)))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/app/version").permitAll()
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
    public PublicIdentityHeaderSanitizingFilter publicIdentityHeaderSanitizingFilter() {
        return new PublicIdentityHeaderSanitizingFilter();
    }

    @Bean
    public HeaderAuthenticationFilter headerAuthenticationFilter(
            @Value("${SAMHAN_GATEWAY_ATTESTATION:}") String gatewayAttestation,
            @Value("${samhan.security.gateway-attestation-enforcement:true}") boolean enforceAttestation) {
        requireGatewayAttestation(gatewayAttestation, enforceAttestation);
        return new HeaderAuthenticationFilter(gatewayAttestation, enforceAttestation);
    }

    private void requireGatewayAttestation(String value, boolean enforcementEnabled) {
        if (enforcementEnabled && (value == null || value.isBlank())) {
            throw new IllegalStateException("SAMHAN_GATEWAY_ATTESTATION is required when gateway attestation enforcement is enabled");
        }
    }
}
