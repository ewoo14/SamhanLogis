package com.samhanair.logis.shared.audit.publisher;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 파일럿 서비스에서만 공통 HTTP request outcome capture를 활성화한다.
 *
 * <p>기본값은 비활성이라 S2b 확장을 암묵적으로 켜지 않는다.
 */
@Configuration
@ConditionalOnProperty(name = "samhan.audit.request-capture.enabled", havingValue = "true")
public class AuditRequestCaptureAutoConfiguration implements WebMvcConfigurer {
    private final AuditRequestCaptureInterceptor interceptor;

    public AuditRequestCaptureAutoConfiguration(
            AuditPublisher publisher,
            @Value("${spring.application.name:unknown-service}") String serviceName) {
        this.interceptor = new AuditRequestCaptureInterceptor(serviceName, publisher);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(interceptor);
    }
}
