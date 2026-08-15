package com.samhanair.logis.slip.config;

import com.samhanair.logis.security.permission.DefaultDynamicPermissionClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/** slip-service direct auth-service 동적 권한 클라이언트 설정. */
@Configuration
public class DynamicPermissionClientConfig {

    @Bean
    public DynamicPermissionClient dynamicPermissionClient(
            @Value("${samhan.auth-service.url:http://localhost:8081}") String authServiceBaseUrl,
            @Value("${samhan.auth-service.connect-timeout-ms:2000}") int connectTimeoutMs,
            @Value("${samhan.auth-service.read-timeout-ms:3000}") int readTimeoutMs,
            @Value("${app.security.internal.token:}") String internalToken,
            @Value("${spring.application.name:slip-service}") String applicationName,
            @Value("${SAMHAN_GATEWAY_ATTESTATION:}") String gatewayAttestation) {
        // 동기 권한 호출은 사용자 요청 critical path 다. repo 내 RestClient 표준인 연결 2초/응답 3초를
        // 기본값으로 사용해 auth 장애를 게이트웨이의 600초 timeout 전에 fail-closed 한다.
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(connectTimeoutMs);
        requestFactory.setReadTimeout(readTimeoutMs);
        return new DefaultDynamicPermissionClient(
                RestClient.builder().requestFactory(requestFactory),
                authServiceBaseUrl,
                internalToken,
                applicationName,
                gatewayAttestation);
    }
}
