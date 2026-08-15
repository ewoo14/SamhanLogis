package com.samhanair.logis.inventory.config;

import com.samhanair.logis.security.permission.DefaultDynamicPermissionClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/** inventory-service direct auth-service 동적 권한 클라이언트 설정. */
@Configuration
public class DynamicPermissionClientConfig {

    @Bean
    public DynamicPermissionClient dynamicPermissionClient(
            @Value("${samhan.auth-service.url:http://localhost:8081}") String authServiceBaseUrl,
            @Value("${app.security.internal.token:}") String internalToken,
            @Value("${spring.application.name:inventory-service}") String applicationName,
            @Value("${SAMHAN_GATEWAY_ATTESTATION:}") String gatewayAttestation) {
        return new DefaultDynamicPermissionClient(
                RestClient.builder(),
                authServiceBaseUrl,
                internalToken,
                applicationName,
                gatewayAttestation);
    }
}
