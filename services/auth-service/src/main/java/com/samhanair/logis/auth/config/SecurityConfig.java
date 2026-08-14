package com.samhanair.logis.auth.config;

import com.samhanair.logis.security.InternalTokenFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Stateless servlet security: gateway-trusted header auth + BCrypt for local password checks.
 *
 * <p>Phase 10 W10-4 DV-3 (PR #99): InternalTokenFilter 는 {@code shared:security} module 의 통합
 * 자동 설정 ({@link com.samhanair.logis.security.InternalSecurityAutoConfiguration}) 에서 bean 으로 주입.
 * auth-service 는 {@code application.yml} 에서 path-prefix=/auth/internal/ + role=INTERNAL +
 * allow-missing-token=false 로 service-prefixed 패턴 보존.
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
                        .requestMatchers("/auth/login").permitAll()
                        .requestMatchers("/auth/logout").permitAll()
                        // Phase 10 P0-2 — 비밀번호 reset 흐름 (정책 조회 + 토큰 발급/confirm) 인증 불필요
                        .requestMatchers("/auth/password/policy").permitAll()
                        .requestMatchers("/auth/password/reset/request").permitAll()
                        .requestMatchers("/auth/password/reset/confirm").permitAll()
                        // P0-2 셀프 재설정 신규 endpoint (6자리 인증번호 방식) — 인증 불필요
                        .requestMatchers("/auth/password-reset/request").permitAll()
                        .requestMatchers("/auth/password-reset/confirm").permitAll()
                        .requestMatchers("/actuator/**").permitAll()
                        // SP-D1 동적 RBAC — MASTER 전용 (method security 에서 추가 검증)
                        .requestMatchers("/auth/admin/permissions/**").authenticated()
                        .requestMatchers("/auth/admin/permission-groups/**").authenticated()
                        .requestMatchers("/auth/admin/accounts/*/groups/**").authenticated()
                        // P0-B: /internal 은 X-Internal-Token system-internal principal 만 — allow-missing flip/위조 X-User-* 회귀 방어.
                        .requestMatchers("/auth/internal/**").access((authentication, context) ->
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
    public HeaderAuthenticationFilter headerAuthenticationFilter(
            @Value("${SAMHAN_GATEWAY_ATTESTATION:}") String attestation,
            @Value("${samhan.security.gateway-attestation-enforcement:true}") boolean enforce) {
        if (enforce && (attestation == null || attestation.isBlank())) throw new IllegalStateException("SAMHAN_GATEWAY_ATTESTATION is required when gateway attestation enforcement is enabled");
        return new HeaderAuthenticationFilter(attestation, enforce);
    }
    @Bean public PublicIdentityHeaderSanitizingFilter publicIdentityHeaderSanitizingFilter() { return new PublicIdentityHeaderSanitizingFilter(); }
    @Bean public FilterRegistrationBean<HeaderAuthenticationFilter> headerAuthenticationFilterRegistration(HeaderAuthenticationFilter f) { var r = new FilterRegistrationBean<HeaderAuthenticationFilter>(f); r.setEnabled(false); return r; }
    @Bean public FilterRegistrationBean<PublicIdentityHeaderSanitizingFilter> publicIdentityHeaderSanitizingFilterRegistration(PublicIdentityHeaderSanitizingFilter f) { var r = new FilterRegistrationBean<PublicIdentityHeaderSanitizingFilter>(f); r.setEnabled(false); return r; }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
