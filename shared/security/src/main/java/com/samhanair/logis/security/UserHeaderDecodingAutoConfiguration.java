package com.samhanair.logis.security;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;

/**
 * servlet 기반 downstream service 의 사용자 표시명 헤더 복원 필터 자동 등록.
 *
 * <p>Spring Cloud Gateway 는 WebFlux 라 본 servlet filter 가 적용되지 않는다.
 */
@AutoConfiguration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnClass({FilterRegistrationBean.class, UserHeaderDecodingFilter.class})
public class UserHeaderDecodingAutoConfiguration {

    /**
     * X-User-Name 단일 헤더만 URL-decode 하는 inbound filter.
     *
     * @return servlet filter registration bean
     */
    @Bean
    @ConditionalOnMissingBean(name = "userHeaderDecodingFilterRegistration")
    public FilterRegistrationBean<UserHeaderDecodingFilter> userHeaderDecodingFilterRegistration() {
        FilterRegistrationBean<UserHeaderDecodingFilter> registration =
                new FilterRegistrationBean<>(new UserHeaderDecodingFilter());
        registration.setName("userHeaderDecodingFilter");
        registration.addUrlPatterns("/*");
        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return registration;
    }
}
