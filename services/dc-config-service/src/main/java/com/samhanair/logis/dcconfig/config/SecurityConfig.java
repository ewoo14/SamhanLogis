package com.samhanair.logis.dcconfig.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
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
 *   <li>{@code /partners/**} — gateway 가 주입한 X-User-* 헤더를 {@link HeaderAuthenticationFilter} 가 신뢰</li>
 * </ul>
 *
 * <p>DC 노출 5겹 가드:
 * <ol>
 *   <li>Controller 분리 — Public 컨트롤러는 DC 응답 X</li>
 *   <li>DTO 분리 — PartnerPublicResponse 에는 DC 필드 자체 부재</li>
 *   <li>Gateway 차단 — `/api/v1/partner-dc-configs/**` 외부 라우트 비등록 (게이트웨이 책임)</li>
 *   <li>QA assertion — IT 에서 외부 응답 페이로드 캡처 + DC 키 부재 assert</li>
 *   <li>internal token — 본 SecurityConfig + {@link InternalTokenFilter}</li>
 * </ol>
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                   InternalAuthProperties internalAuthProperties) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(new InternalTokenFilter(internalAuthProperties),
                        UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(new HeaderAuthenticationFilter(), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
