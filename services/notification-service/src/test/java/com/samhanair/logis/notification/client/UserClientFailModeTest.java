package com.samhanair.logis.notification.client;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.discovery.ServiceDiscoveryClient;
import com.samhanair.logis.notification.config.UserCacheProperties;
import com.samhanair.logis.userclient.UserVerifierProperties;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

/** UserClient fail-mode 환경 배선 회귀 테스트. */
class UserClientFailModeTest {

    @Test
    void strictFailMode_reachesDefaultUserVerifier() {
        UserCacheProperties cacheProperties = new UserCacheProperties();
        cacheProperties.setTtlSeconds(1L);
        cacheProperties.setMaxSize(10L);

        UserClient client = new UserClient(
                RestClient.builder(),
                noopDiscovery(),
                "http://127.0.0.1:1",
                UserVerifierProperties.FailMode.STRICT,
                "test-token",
                cacheProperties);

        assertThat(client.exists(java.util.UUID.randomUUID())).isFalse();
    }

    private static ServiceDiscoveryClient noopDiscovery() {
        return new ServiceDiscoveryClient() {
            @Override public void register(String serviceName, String host, int port) { }
            @Override public void deregister(String serviceName) { }
            @Override public List<com.samhanair.logis.discovery.ServiceInstance> lookup(String serviceName) {
                return List.of();
            }
            @Override public boolean healthcheck(String serviceName) { return false; }
        };
    }
}
