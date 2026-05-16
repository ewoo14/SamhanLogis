package com.samhanair.logis.partnerauth.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Partner Auth Service 보안 설정.
 *
 * <p>Stateless 서블릿 보안 (gateway 가 X-User-Id/Role 을 forward 가정).
 * 본 PR (M2 W2) 단계의 endpoint 는 모두 외부 거래처가 호출하므로 전부 permit;
 * W3 단계에서 JWT bearer 검증 필터를 추가하여 7개 endpoint 중
 * {@code /partner-status} (조회) + {@code /partner-register} (가입) 만 permit
 * 하고 나머지는 partner-JWT 인증 필요로 정정 예정 (설계서 §5.3).
 *
 * <p>Password encoder 는 {@link PasswordEncoderFactories#createDelegatingPasswordEncoder()}
 * 의 DelegatingPasswordEncoder 를 그대로 사용하므로 BCrypt({prefix bcrypt}) +
 * 레거시 SHA-256({prefix sha256}) 동시 호환 (legacy 비밀번호 마이그 시 prefix 만
 * {@code {sha256}} 로 시드, 첫 로그인 시 BCrypt 로 재인코딩 — service 위임).
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        // 7개 endpoint 모두 외부 거래처가 호출 — W2 단계는 permit
                        .requestMatchers("/api/v1/auth/partner-**").permitAll()
                        .requestMatchers("/api/v1/auth/partner-status").permitAll()
                        .requestMatchers("/actuator/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(new HeaderAuthenticationFilter(), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        // {bcrypt} prefix 로 신규 인코딩, {sha256} prefix 로 legacy 매칭.
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
}
