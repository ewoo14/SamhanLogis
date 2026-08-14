package com.samhanair.logis.dcconfig.config;

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
 *   <li>desktop admin endpoints — gateway 가 주입한 X-User-* 헤더를 {@link HeaderAuthenticationFilter} 가 신뢰</li>
 * </ul>
 *
 * <p>DC 노출 5겹 가드:
 * <ol>
 *   <li>Controller 분리 — Public 컨트롤러는 DC 응답 X</li>
 *   <li>DTO 분리 — PartnerPublicResponse 에는 DC 필드 자체 부재</li>
 *   <li>Gateway 분리 — public partner 응답과 desktop admin DC 설정 route 를 분리</li>
 *   <li>QA assertion — public 응답 페이로드 캡처 + DC 키 부재 assert</li>
 *   <li>internal token / method security — 본 SecurityConfig + {@link InternalTokenFilter} + {@code @PreAuthorize}</li>
 * </ol>
 *
 * <p>Phase 10 W10-4 DV-3 (PR #99): InternalTokenFilter 는 {@code shared:security} module 통합 자동 설정에서 주입.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, InternalTokenFilter internalTokenFilter,
            PublicIdentityHeaderSanitizingFilter sanitizer, HeaderAuthenticationFilter headerFilter)
            throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        // P0-B: /internal 은 X-Internal-Token system-internal principal 만 — allow-missing flip/위조 X-User-* 회귀 방어.
                        .requestMatchers("/internal/**").access((authentication, context) ->
                                new org.springframework.security.authorization.AuthorizationDecision(
                                        authentication.get() != null
                                                && com.samhanair.logis.security.InternalTokenFilter.INTERNAL_PRINCIPAL
                                                        .equals(authentication.get().getName())))
                        .anyRequest().authenticated())
                .addFilterBefore(internalTokenFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(sanitizer, InternalTokenFilter.class)
                .addFilterAfter(headerFilter, InternalTokenFilter.class);
        return http.build();
    }

    @Bean
    public PublicIdentityHeaderSanitizingFilter publicIdentityHeaderSanitizingFilter() { return new PublicIdentityHeaderSanitizingFilter(); }

    @Bean
    public HeaderAuthenticationFilter headerAuthenticationFilter(
            @Value("${SAMHAN_GATEWAY_ATTESTATION:}") String attestation,
            @Value("${samhan.security.gateway-attestation-enforcement:true}") boolean enforce) {
        if (enforce && (attestation == null || attestation.isBlank())) throw new IllegalStateException("SAMHAN_GATEWAY_ATTESTATION is required when gateway attestation enforcement is enabled");
        return new HeaderAuthenticationFilter(attestation, enforce);
    }

    @Bean
    public FilterRegistrationBean<HeaderAuthenticationFilter> headerAuthenticationFilterRegistration(HeaderAuthenticationFilter filter) { var r = new FilterRegistrationBean<HeaderAuthenticationFilter>(filter); r.setEnabled(false); return r; }

    @Bean
    public FilterRegistrationBean<PublicIdentityHeaderSanitizingFilter> publicIdentityHeaderSanitizingFilterRegistration(PublicIdentityHeaderSanitizingFilter filter) { var r = new FilterRegistrationBean<PublicIdentityHeaderSanitizingFilter>(filter); r.setEnabled(false); return r; }
}
