package com.samhanair.logis.security;

import com.samhanair.logis.security.department.DepartmentAspect;
import com.samhanair.logis.security.permission.PermissionGuardMetrics;
import com.samhanair.logis.security.permission.PermissionSecurityAutoConfiguration;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;

/**
 * X-Internal-Token 통합 인증 자동 설정 — Phase 10 W10-4 (PR #99) DV-3 채택.
 *
 * <p>{@code shared:security} module 의존성을 가진 service 가 별도 설정 없이 다음 bean 을 활용 가능:
 *
 * <ul>
 *   <li>{@link InternalAuthProperties} — {@code app.security.internal.*} 바인딩
 *   <li>{@link InternalTokenFilter} — {@code SecurityConfig} 가 {@code .addFilterBefore(internalTokenFilter,
 *       UsernamePasswordAuthenticationFilter.class)} 로 등록
 *   <li>{@link InternalTokenGuard} — {@code @PostConstruct} verify() 가 dev 기본 토큰 prod 부팅 차단
 * </ul>
 *
 * <p>{@code @ConditionalOnMissingBean} — 각 service 가 별도 properties/filter/guard 를 정의했으면 우선.
 *
 * <p>{@code @ConditionalOnClass(OncePerRequestFilter.class)} — Spring Security web starter 미적용 service 는
 * 자동 무시.
 */
@AutoConfiguration(after = PermissionSecurityAutoConfiguration.class)
@ConditionalOnClass(name = "org.springframework.web.filter.OncePerRequestFilter")
@EnableConfigurationProperties(InternalAuthProperties.class)
public class InternalSecurityAutoConfiguration {

    /**
     * {@link InternalTokenFilter} bean 노출 — 각 service 의 {@code SecurityConfig} 가
     * {@code .addFilterBefore(filter, UsernamePasswordAuthenticationFilter.class)} 로 명시 등록.
     */
    @Bean
    @ConditionalOnMissingBean
    public InternalTokenFilter internalTokenFilter(InternalAuthProperties properties) {
        return new InternalTokenFilter(properties);
    }

    /** dev 기본 토큰 prod 부팅 차단 가드 — 자동 등록. */
    @Bean
    @ConditionalOnMissingBean
    public InternalTokenGuard internalTokenGuard(InternalAuthProperties properties, Environment environment) {
        return new InternalTokenGuard(properties, environment);
    }

    /**
     * Phase 12 인사 카테고리 가드 helper — {@code @PreAuthorize} SpEL {@code @hr.isExecutiveOffice()} 로 참조.
     *
     * <p>{@code shared:security} 를 의존하는 모든 service 에 자동 등록.
     * {@code @ConditionalOnMissingBean} — 각 service 가 별도 정의 시 우선.
     */
    @Bean("hr")
    @ConditionalOnMissingBean(name = "hr")
    public HrAuthorizationHelper hrAuthorizationHelper() {
        return new HrAuthorizationHelper();
    }

    /**
     * M1 부서 게이트 AOP — 기존 {@code @PreAuthorize("@hr.isExecutiveOffice()")} 제거용.
     *
     * <p>{@link HrAuthorizationHelper} 동일 bean 을 주입하므로 SpEL 전후 부서 판정이 동일하다.
     */
    @Bean
    @ConditionalOnProperty(name = "samhan.security.department.enabled", havingValue = "true")
    @ConditionalOnMissingBean
    public DepartmentAspect departmentAspect(
            HrAuthorizationHelper hrAuthorizationHelper,
            ObjectProvider<PermissionGuardMetrics> metricsProvider,
            @Value("${spring.application.name:unknown}") String applicationName) {
        return new DepartmentAspect(hrAuthorizationHelper, metricsProvider.getIfAvailable(), applicationName);
    }
}
