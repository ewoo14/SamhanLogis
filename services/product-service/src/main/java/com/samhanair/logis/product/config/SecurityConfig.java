package com.samhanair.logis.product.config;

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
 * Stateless servlet security:
 * <ul>
 *   <li>{@code /internal/**} — {@link InternalTokenFilter} 가 X-Internal-Token 으로 인증</li>
 *   <li>그 외 — gateway 가 주입한 X-User-* 헤더를 {@link HeaderAuthenticationFilter} 가 신뢰</li>
 * </ul>
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
                        // P0-B: /internal 은 X-Internal-Token system-internal principal 만 — allow-missing flip/위조 X-User-* 회귀 방어.
                        .requestMatchers("/products/internal/**").access((authentication, context) ->
                                new org.springframework.security.authorization.AuthorizationDecision(
                                        authentication.get() != null
                                                && com.samhanair.logis.security.InternalTokenFilter.INTERNAL_PRINCIPAL
                                                        .equals(authentication.get().getName())))
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
