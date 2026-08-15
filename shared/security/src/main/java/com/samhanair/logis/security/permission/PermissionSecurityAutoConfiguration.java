package com.samhanair.logis.security.permission;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.web.client.RestClient;

/**
 * SP-D5 동적 RBAC 권한 검증 공통 인프라 자동 설정.
 *
 * <p>{@code shared:security} 모듈을 의존하는 service 가 별도 설정 없이 다음 bean 을 자동 활성화:
 *
 * <ul>
 *   <li>{@link PermissionGuardMetrics} — {@code permission_guard_denied_total} Micrometer Counter</li>
 *   <li>{@link PermissionAspect} — {@link RequirePermission} 어노테이션 AOP 인터셉터</li>
 * </ul>
 *
 * <p>{@link MeterRegistry} 는 shared:security 소비 service 의 actuator dependency 에서 제공한다.
 *
 * <p>{@code @EnableAspectJAutoProxy} — Spring AOP 프록시 자동 활성화.
 * 소비자 service 가 이미 {@code @EnableAspectJAutoProxy} 를 선언한 경우 중복 무시된다.
 *
 * <p>SP-D5 cycle 2 fix (P1-2): 본 클래스가 bean 등록의 단일 진입점.
 * {@link PermissionAspect} / {@link PermissionGuardMetrics} 에서 {@code @Component} 를 제거하여
 * consumer service 의 component scan 범위가 본 패키지를 포함하더라도 조건부 활성화 우회를 차단한다.
 *
 * <p>SP-D5 cycle 2 fix (P0-2): {@link PermissionAspect} 의 {@code service} tag 를
 * {@code spring.application.name} property 로 주입하여 Controller 패키지 추론과의 불일치를 제거한다.
 *
 * @since SP-D5
 */
@AutoConfiguration
@ConditionalOnClass(name = "io.micrometer.core.instrument.MeterRegistry")
@EnableAspectJAutoProxy
public class PermissionSecurityAutoConfiguration {

    /**
     * PermissionGuard deny 횟수 Micrometer Counter 컴포넌트.
     *
     * @param meterRegistry Micrometer MeterRegistry
     * @return {@link PermissionGuardMetrics} bean
     */
    @Bean
    @ConditionalOnMissingBean
    public PermissionGuardMetrics permissionGuardMetrics(MeterRegistry meterRegistry) {
        return new PermissionGuardMetrics(meterRegistry);
    }

    /**
     * {@link RequirePermission} AOP 인터셉터.
     *
     * <p>{@code spring.application.name} property 가 비어 있으면 {@code "unknown"} 으로 정규화한다.
     * {@code samhan.security.permission.enforcement-mode} 기본값은 {@code account} 이며,
     * {@code role} 은 아로로지스 독립 auth descope 전용 opt-in 이다.
     *
     * @param clientProvider DynamicPermissionClient lazy provider
     * @param metrics        deny 횟수 카운터
     * @param applicationName {@code spring.application.name} property (Counter {@code service} tag)
     * @return {@link PermissionAspect} bean
     */
    @Bean
    @ConditionalOnMissingBean
    public PermissionAspect permissionAspect(
            ObjectProvider<DynamicPermissionClient> clientProvider,
            PermissionGuardMetrics metrics,
            @Value("${spring.application.name:unknown}") String applicationName,
            @Value("${samhan.security.permission.enforcement-mode:account}") String enforcementMode) {
        return new PermissionAspect(
                clientProvider,
                metrics,
                applicationName,
                "role".equalsIgnoreCase(enforcementMode));
    }

    /**
     * SP-D6 — 9 service 의 중복 {@code DynamicPermissionClientImpl} 을 일원화한 기본 구현.
     *
     * <p>소비자 service 가 자체 {@link DynamicPermissionClient} bean 을 정의한 경우
     * {@code @ConditionalOnMissingBean} 에 의해 본 기본 구현은 비활성화된다.
     *
     * <p>{@code loadBalancedRestClientBuilder} bean 이 없는 service
     * (auth/dashboard/dc-config/groupware 등 — DPC 호출자 아님) 에서는 본 bean 도 비활성화된다.
     *
     * @param loadBalancedBuilder Spring Cloud LoadBalancer 통합 빌더
     * @return {@link DefaultDynamicPermissionClient} bean
     */
    @Bean
    @ConditionalOnMissingBean(DynamicPermissionClient.class)
    @ConditionalOnBean(name = "loadBalancedRestClientBuilder")
    public DynamicPermissionClient defaultDynamicPermissionClient(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder loadBalancedBuilder,
            @Value("${app.security.internal.token:}") String internalToken,
            @Value("${spring.application.name:unknown}") String applicationName,
            @Value("${SAMHAN_GATEWAY_ATTESTATION:}") String gatewayAttestation) {
        return new DefaultDynamicPermissionClient(
                loadBalancedBuilder,
                "http://auth-service",
                internalToken,
                applicationName,
                gatewayAttestation);
    }
}
