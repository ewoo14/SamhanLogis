package com.samhanair.logis.arologis.config;

import com.samhanair.logis.security.InternalTokenFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;

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
                                                   ArologisJwtFilter arologisJwtFilter)
            throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        // 2026-05-14 분리 — 자체 auth endpoint (login 은 인증 전 진입).
                        .requestMatchers("/auth/admin/login", "/auth/driver/login", "/auth/refresh").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(internalTokenFilter, UsernamePasswordAuthenticationFilter.class)
                // 2026-05-14 — Bearer JWT 자체 검증 (gateway 우회 직접 호출 대응). InternalToken 다음.
                .addFilterAfter(arologisJwtFilter, InternalTokenFilter.class)
                .addFilterAfter(new HeaderAuthenticationFilter(), ArologisJwtFilter.class);
        return http.build();
    }

    /**
     * BCrypt strength 10 — 2026-05-14 분리 (AdminLoginService 의존).
     * auth-service / partner-auth-service 와 동일 strength.
     */
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10);
    }
}
