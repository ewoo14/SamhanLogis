package com.samhanair.logis.security.permission;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.EnableAspectJAutoProxy;

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
 * <p>조건부 활성화:
 * <ul>
 *   <li>{@link PermissionGuardMetrics} — {@link MeterRegistry} bean 존재 시 (Micrometer 의존 service)</li>
 *   <li>{@link PermissionAspect} — {@link MeterRegistry} bean 존재 시 (metrics 필요)</li>
 * </ul>
 *
 * <p>{@code @EnableAspectJAutoProxy} — Spring AOP 프록시 자동 활성화.
 * 소비자 service 가 이미 {@code @EnableAspectJAutoProxy} 를 선언한 경우 중복 무시된다.
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
    @ConditionalOnBean(MeterRegistry.class)
    public PermissionGuardMetrics permissionGuardMetrics(MeterRegistry meterRegistry) {
        return new PermissionGuardMetrics(meterRegistry);
    }

    /**
     * {@link RequirePermission} AOP 인터셉터.
     *
     * @param clientProvider DynamicPermissionClient lazy provider
     * @param metrics        deny 횟수 카운터
     * @return {@link PermissionAspect} bean
     */
    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnBean(MeterRegistry.class)
    public PermissionAspect permissionAspect(
            ObjectProvider<DynamicPermissionClient> clientProvider,
            PermissionGuardMetrics metrics) {
        return new PermissionAspect(clientProvider, metrics);
    }
}
