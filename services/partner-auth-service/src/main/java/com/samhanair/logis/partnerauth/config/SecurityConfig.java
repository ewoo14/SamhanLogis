package com.samhanair.logis.partnerauth.config;

import com.samhanair.logis.security.InternalTokenFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
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
 *
 * <p>PR #462 Round C #4 — {@code shared:security} 의존 신설 후속(재리뷰 #3): {@code shared:security}
 * 자동 설정({@link com.samhanair.logis.security.InternalSecurityAutoConfiguration})이 노출하는
 * {@link InternalTokenFilter} bean 은 13 service 표준대로 본 SecurityFilterChain 에 명시 배선한다
 * ({@code .addFilterBefore(internalTokenFilter, ...)}). 미배선 시 해당 filter bean 이 Spring Boot 의
 * servlet 자동 등록으로만 체인 외부에서 실행되어 순서가 불명확해진다. {@code path-prefix=/internal/}
 * (default) + {@code allow-missing-token=true} (default) 이므로 외부 거래처 공개 흐름
 * ({@code /api/v1/auth/partner-**} = login/register) 은 prefix 불일치로 즉시 통과(no-op) —
 * 기존 공개 흐름 회귀 0. (inventory/partner-order SecurityConfig 와 동일 2단 filter chain.)
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, InternalTokenFilter internalTokenFilter,
            HeaderAuthenticationFilter headerFilter, PublicIdentityHeaderSanitizingFilter sanitizer)
            throws Exception {
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
                // shared:security InternalTokenFilter 명시 배선 (13 service 표준). 토큰 미제시/prefix 외 → no-op.
                .addFilterBefore(internalTokenFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(sanitizer, InternalTokenFilter.class)
                .addFilterAfter(headerFilter, InternalTokenFilter.class);
        return http.build();
    }

    @Bean public HeaderAuthenticationFilter headerAuthenticationFilter(
            @Value("${SAMHAN_GATEWAY_ATTESTATION:}") String attestation,
            @Value("${samhan.security.gateway-attestation-enforcement:true}") boolean enforce) {
        if (enforce && (attestation == null || attestation.isBlank())) throw new IllegalStateException("SAMHAN_GATEWAY_ATTESTATION is required when gateway attestation enforcement is enabled");
        return new HeaderAuthenticationFilter(attestation, enforce);
    }
    @Bean public PublicIdentityHeaderSanitizingFilter publicIdentityHeaderSanitizingFilter() { return new PublicIdentityHeaderSanitizingFilter(); }
    @Bean public FilterRegistrationBean<HeaderAuthenticationFilter> headerAuthenticationFilterRegistration(HeaderAuthenticationFilter f) { var r=new FilterRegistrationBean<HeaderAuthenticationFilter>(f);r.setEnabled(false);return r; }
    @Bean public FilterRegistrationBean<PublicIdentityHeaderSanitizingFilter> publicIdentityHeaderSanitizingFilterRegistration(PublicIdentityHeaderSanitizingFilter f) { var r=new FilterRegistrationBean<PublicIdentityHeaderSanitizingFilter>(f);r.setEnabled(false);return r; }

    @Bean
    public PasswordEncoder passwordEncoder() {
        // {bcrypt} prefix 로 신규 인코딩, {sha256} prefix 로 legacy 매칭.
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
}
