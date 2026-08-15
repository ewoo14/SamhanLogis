package com.samhanair.logis.partnerauth.config;

import com.samhanair.logis.security.permission.DefaultDynamicPermissionClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * partner-auth-service 의 auth-service 동적 권한 클라이언트 설정 — PR #462 Round C #4 (P1 보안).
 *
 * <p>{@code PartnerApprovalsController} 의 3 endpoint 가 {@link com.samhanair.logis.security.permission.RequirePermission}
 * 동적 RBAC 가드를 사용한다. {@link com.samhanair.logis.security.permission.PermissionAspect} 는 account 모드에서
 * {@link DynamicPermissionClient} bean 을 통해 auth-service {@code /auth/internal/permissions/check} 를 호출한다.
 *
 * <p><b>bean 명시 정의 필요 사유</b>: 본 서비스에는 {@code loadBalancedRestClientBuilder} bean 이 없으므로
 * {@link com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration#defaultDynamicPermissionClient}
 * (해당 builder {@code @ConditionalOnBean}) 가 활성화되지 않는다. bean 부재 시 {@code PermissionAspect} 는
 * fail-secure 로 전 직원을 deny → 정상 영업 직원도 lockout 된다. 이를 막기 위해 partner-order-service 와 동일하게
 * 명시적 base URL 기반 {@link DefaultDynamicPermissionClient} bean 을 등록한다 (Eureka loadbalancer 비의존).
 *
 * <p>auth-service URL/internal-token 은 13 service 표준 {@code samhan.auth-service.url} +
 * {@code app.security.internal.token} (= {@code SAMHAN_INTERNAL_TOKEN}) 규약을 따른다.
 */
@Configuration
public class DynamicPermissionClientConfig {

    /**
     * auth-service 동적 권한 조회 클라이언트.
     *
     * @param authServiceBaseUrl auth-service base URL (기본 {@code http://localhost:8081}, 운영 env override)
     * @param internalToken      auth-service {@code /auth/internal/**} 가드 통과용 X-Internal-Token
     * @param applicationName    호출자 service 식별자 (auth-service 호출 추적 헤더)
     * @return {@link DefaultDynamicPermissionClient} bean
     */
    @Bean
    public DynamicPermissionClient dynamicPermissionClient(
            @Value("${samhan.auth-service.url:http://localhost:8081}") String authServiceBaseUrl,
            @Value("${app.security.internal.token:}") String internalToken,
            @Value("${spring.application.name:partner-auth-service}") String applicationName,
            @Value("${SAMHAN_GATEWAY_ATTESTATION:}") String gatewayAttestation) {
        return new DefaultDynamicPermissionClient(
                RestClient.builder(),
                authServiceBaseUrl,
                internalToken,
                applicationName,
                gatewayAttestation);
    }
}
