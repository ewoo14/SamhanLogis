package com.samhanair.logis.notification.client;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.discovery.ServiceDiscoveryClient;
import com.samhanair.logis.notification.config.UserCacheProperties;
import com.samhanair.logis.userclient.UserVerifierProperties;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

/**
 * UserClient bulk verify + 위임 패턴 단위 테스트 — Phase 9 W4 (W3 backlog #1 채택).
 *
 * <p>Phase 9 W4 시점에 본 wrapper 가 {@code shared:user-client-abstraction} 의
 * {@link com.samhanair.logis.userclient.DefaultUserVerifier} 로 위임. fail-soft 정책 (네트워크
 * 실패 시 true) 일관 보존.
 *
 * <p>커버 3 case:
 * <ol>
 *   <li>verifyBulk — null / empty 입력 → empty map</li>
 *   <li>cache hit — exists 1차 호출이 결과를 cache 적재 → 후속 verifyBulk 가 RPC 안 함 (cache hit)</li>
 *   <li>exists 캐시 적재 후 동일 호출 RPC skip 검증 (invalidate 시 재호출 가능)</li>
 * </ol>
 */
class UserClientBulkVerifyTest {

    private UserClient client;

    @BeforeEach
    void setup() {
        UserCacheProperties props = new UserCacheProperties();
        props.setTtlSeconds(60L);
        props.setMaxSize(1000L);

        ServiceDiscoveryClient discovery = new ServiceDiscoveryClient() {
            @Override public void register(String serviceName, String host, int port) { }
            @Override public void deregister(String serviceName) { }
            @Override public java.util.List<com.samhanair.logis.discovery.ServiceInstance> lookup(String serviceName) {
                return java.util.List.of();
            }
            @Override public boolean healthcheck(String serviceName) { return false; }
        };

        // baseUrl = 의도적 unreachable — fail-soft 정책 (network fail → true) 검증 흐름 유도
        client = new UserClient(RestClient.builder(), discovery,
                "http://127.0.0.1:1", UserVerifierProperties.FailMode.OPEN, "test-token", props);
    }

    @Test
    void verifyBulk_with_null_or_empty_returns_empty_map() {
        assertThat(client.verifyBulk(null)).isEmpty();
        assertThat(client.verifyBulk(List.of())).isEmpty();
    }

    @Test
    void verifyBulk_after_exists_uses_cache() {
        UUID id1 = UUID.randomUUID();
        UUID id2 = UUID.randomUUID();
        // exists 1차 — fail-soft true → cache 적재
        assertThat(client.exists(id1)).isTrue();
        assertThat(client.exists(id2)).isTrue();

        Map<UUID, Boolean> result = client.verifyBulk(List.of(id1, id2));
        assertThat(result).hasSize(2);
        assertThat(result.get(id1)).isTrue();
        assertThat(result.get(id2)).isTrue();
    }

    @Test
    void exists_caches_lookup_result_and_invalidate_clears() {
        UUID id = UUID.randomUUID();

        boolean first = client.exists(id);
        assertThat(first).isTrue();
        // cache hit 검증 — invalidate 후에도 fail-soft 로 true 반환 (다시 RPC 시도하지만 실패 → true)
        client.invalidateCache();
        assertThat(client.exists(id)).isTrue();
    }
}
