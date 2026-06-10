package com.samhanair.logis.slip.config;

import com.samhanair.logis.security.InternalTokenFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

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
    public SecurityFilterChain securityFilterChain(HttpSecurity http, InternalTokenFilter internalTokenFilter)
            throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        // Slice B (notification-slice-B): 공개 모바일 endpoint — 토큰만 검증
                        .requestMatchers("/public/**").permitAll()
                        // 종합견적서(웹) 견적 저장/불러오기 — estimate-app 이 server-to-server 무인증
                        // 호출(legacy 노션은 GAS 서비스계정이 사용자 대신 접근). 조회는 userEmail
                        // 파라미터로 사용자별 격리, 저장 blob 은 견적 초안(저민감). 후속 하드닝 시
                        // X-Internal-Token 도입 검토.
                        .requestMatchers("/api/v1/estimates/snapshots",
                                "/api/v1/estimates/snapshots/**").permitAll()
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
                .addFilterAfter(new HeaderAuthenticationFilter(), InternalTokenFilter.class);
        return http.build();
    }
}
