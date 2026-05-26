package com.samhanair.logis.dashboard.it;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.dashboard.DashboardServiceApplication;
import com.samhanair.logis.discovery.ServiceDiscoveryClient;
import com.samhanair.logis.security.permission.DynamicPermissionClient;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.TestPropertySource;

/** dashboard-service 실 컨텍스트의 동적 권한 클라이언트 등록 회귀 테스트. */
@SpringBootTest(
        classes = DashboardServiceApplication.class,
        webEnvironment = SpringBootTest.WebEnvironment.NONE
)
@TestPropertySource(properties = {
        "spring.profiles.active=local",
        "eureka.client.enabled=false",
        "eureka.client.register-with-eureka=false",
        "eureka.client.fetch-registry=false",
        "spring.jpa.hibernate.ddl-auto=none",
        "spring.main.lazy-initialization=true",
        "app.security.internal.token=test-internal-token",
        "samhan.auth-service.url=http://localhost:8081"
})
class DashboardDynamicPermissionClientContextIT {

    @Autowired
    private ObjectProvider<DynamicPermissionClient> dynamicPermissionClientProvider;
    @MockBean
    private ServiceDiscoveryClient serviceDiscoveryClient;

    @Test
    @DisplayName("dashboard-service 실 컨텍스트에 DynamicPermissionClient bean 이 등록된다")
    void dynamicPermissionClientBeanPresent() {
        assertThat(dynamicPermissionClientProvider.getIfAvailable()).isNotNull();
    }
}
