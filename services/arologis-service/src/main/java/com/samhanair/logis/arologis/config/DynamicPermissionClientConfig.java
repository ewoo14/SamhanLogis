package com.samhanair.logis.arologis.config;

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
            @Value("${spring.application.name:arologis-service}") String applicationName) {
        DynamicPermissionClient delegate = new DefaultDynamicPermissionClient(
                RestClient.builder(),
                authServiceBaseUrl,
                internalToken,
                applicationName);
        return new ArologisRoleNormalizingPermissionClient(delegate);
    }

    private record ArologisRoleNormalizingPermissionClient(DynamicPermissionClient delegate)
            implements DynamicPermissionClient {

        @Override
        public boolean canEdit(String roleCode, String pageCode) {
            return delegate.canEdit(normalize(roleCode), pageCode);
        }

        @Override
        public boolean canView(String roleCode, String pageCode) {
            return delegate.canView(normalize(roleCode), pageCode);
        }

        @Override
        public boolean check(UUID accountId, String pageCode, PermissionAction action) {
            return delegate.check(accountId, pageCode, action);
        }

        @Override
        public Map<String, EnumSet<PermissionAction>> bulkLoad(UUID accountId) {
            return delegate.bulkLoad(accountId);
        }

        /** arologis 접두 롤(AdminUserRole) 정의 — prefix 제거 후 동일 중앙 코드. */
        private static final String AROLOGIS_ROLE_PREFIX = "AROLOGIS_";

        /**
         * arologis JWT 롤(AROLOGIS_*)을 중앙 {@code role_page_permissions} 코드로 정규화한다.
         *
         * <p>6-롤 전부 {@code AROLOGIS_} 접두만 제거하면 중앙 코드와 일치한다(AROLOGIS_MASTER→MASTER,
         * AROLOGIS_DEVELOPER→DEVELOPER, AROLOGIS_SALES→SALES, AROLOGIS_ACCOUNTANT→ACCOUNTANT,
         * AROLOGIS_DRIVER→DRIVER). 접두 없는 코드는 변경 없이 통과(방어적).
         */
        private static String normalize(String roleCode) {
            if (roleCode != null && roleCode.startsWith(AROLOGIS_ROLE_PREFIX)) {
                return roleCode.substring(AROLOGIS_ROLE_PREFIX.length());
            }
            return roleCode;
        }
    }
}
