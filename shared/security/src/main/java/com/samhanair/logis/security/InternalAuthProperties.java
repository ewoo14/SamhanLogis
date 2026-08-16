package com.samhanair.logis.security;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * X-Internal-Token 인증 설정 — Phase 10 W10-4 (PR #99) DV-3 채택으로 13 service 통합 module 추출.
 *
 * <p>호환 properties:
 *
 * <ul>
 *   <li>{@code app.security.internal.token} — 필수, shared secret. dev placeholder {@code CHANGE_ME_LOCAL_ONLY}
 *       는 {@link InternalTokenGuard} 가 prod 프로파일 부팅 차단.
 *   <li>{@code app.security.internal.path-prefix} — default {@code /internal/}. auth-service 만 {@code /auth/internal/}.
 *   <li>{@code app.security.internal.role} — default {@code MASTER} (ROLE_MASTER 부여). auth-service 만 {@code INTERNAL}
 *       (ROLE_INTERNAL).
 *   <li>{@code app.security.internal.allow-missing-token} — default {@code true} (11 service: downstream 처리).
 *       auth-service 만 {@code false} (즉시 401).
 * </ul>
 *
 * <p>본 클래스는 {@code @ConfigurationProperties} 만 보유. {@code @ConfigurationPropertiesScan} 는
 * {@link InternalSecurityAutoConfiguration} 가 등록.
 */
@Data
@ConfigurationProperties(prefix = "app.security.internal")
public class InternalAuthProperties {

    /** Shared secret for {@code X-Internal-Token} header. dev default 가 prod 진입 시 부팅 차단. */
    private String token;

    /** {@code /internal/} prefix 한정 인증 — service 별 prefix 차이 수용 (auth-service: {@code /auth/internal/}). */
    private String pathPrefix = "/internal/";

    /** Spring Security role suffix — {@code MASTER} → ROLE_MASTER. auth-service 는 {@code INTERNAL} → ROLE_INTERNAL. */
    private String role = "MASTER";

    /**
     * 토큰 미제시 시 동작:
     *
     * <ul>
     *   <li>{@code true} (default, 12 service 표준) — chain 계속 진행 (downstream HeaderAuthenticationFilter
     *       가 X-User-* 헤더로 일반 사용자 흐름 처리).
     *   <li>{@code false} (auth-service 표준) — 즉시 401 반환.
     * </ul>
     */
    private boolean allowMissingToken = true;
}
