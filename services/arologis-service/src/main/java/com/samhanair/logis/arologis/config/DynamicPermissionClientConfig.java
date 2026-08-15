package com.samhanair.logis.arologis.config;

import com.samhanair.logis.arologis.util.ArologisRoleCodeNormalizer;
import com.samhanair.logis.security.permission.DefaultDynamicPermissionClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.samhanair.logis.security.permission.PermissionAction;
import java.util.EnumSet;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/** arologis-service 의 direct auth-service 동적 권한 클라이언트 설정. */
@Configuration
public class DynamicPermissionClientConfig {

    @Bean
    public DynamicPermissionClient dynamicPermissionClient(
            @Value("${samhan.auth-service.url:http://localhost:8081}") String authServiceBaseUrl,
            @Value("${app.security.internal.token:}") String internalToken,
            @Value("${spring.application.name:arologis-service}") String applicationName,
            @Value("${samhan.security.gateway-attestation:}") String gatewayAttestation) {
        DynamicPermissionClient delegate = new DefaultDynamicPermissionClient(
                RestClient.builder(),
                authServiceBaseUrl,
                internalToken,
                applicationName,
                gatewayAttestation);
        return new ArologisRoleNormalizingPermissionClient(delegate);
    }

    private record ArologisRoleNormalizingPermissionClient(DynamicPermissionClient delegate)
            implements DynamicPermissionClient {

        @Override
        public boolean canEdit(String roleCode, String pageCode) {
            return delegate.canEdit(ArologisRoleCodeNormalizer.normalize(roleCode), pageCode);
        }

        @Override
        public boolean canView(String roleCode, String pageCode) {
            return delegate.canView(ArologisRoleCodeNormalizer.normalize(roleCode), pageCode);
        }

        @Override
        public boolean check(UUID accountId, String pageCode, PermissionAction action) {
            return delegate.check(accountId, pageCode, action);
        }

        @Override
        public Map<String, EnumSet<PermissionAction>> bulkLoad(UUID accountId) {
            return delegate.bulkLoad(accountId);
        }
    }
}
