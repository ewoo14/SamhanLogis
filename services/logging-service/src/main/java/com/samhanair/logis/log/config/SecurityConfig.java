package com.samhanair.logis.log.config;

import com.samhanair.logis.security.InternalTokenFilter;
import jakarta.servlet.http.HttpServletResponse;
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
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;

/** logging-service servlet 보안 설정. */
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
                        .requestMatchers("/actuator/**").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint(jsonEntryPoint())
                        .accessDeniedHandler(jsonDeniedHandler()))
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

    private static AuthenticationEntryPoint jsonEntryPoint() {
        return (request, response, exception) -> {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write(
                    "{\"success\":false,\"code\":\"UNAUTHORIZED\",\"message\":\"인증 토큰이 없습니다\"}");
        };
    }

    private static AccessDeniedHandler jsonDeniedHandler() {
        return (request, response, exception) -> {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write(
                    "{\"success\":false,\"code\":\"FORBIDDEN\",\"message\":\"권한이 없습니다\"}");
        };
    }
}
