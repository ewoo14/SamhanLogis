package com.samhanair.logis.notification.client;

import com.samhanair.logis.discovery.ServiceDiscoveryClient;
import com.samhanair.logis.notification.config.UserCacheProperties;
import com.samhanair.logis.userclient.DefaultUserVerifier;
import com.samhanair.logis.userclient.UserVerifier;
import com.samhanair.logis.userclient.UserVerifierProperties;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * user-service 호출 client — notification-service local wrapper.
 *
 * <p>Phase 9 W4 — W3 backlog #1 채택. 기존 in-class Caffeine + RestClient 구현을
 * {@code shared:user-client-abstraction} 모듈의 {@link DefaultUserVerifier} 로 위임.
 * IT 의 {@code @MockBean UserClient} 패턴은 그대로 유지 (회귀 0).
 *
 * <p>ServiceDiscoveryClient 세 번째 소비자 (W1 partner / W2 groupware → W3 notification).
 * Phase 10 cutover 시점에 본 wrapper 가 service-name 기반 lookup 으로 전환.
 *
 * <p>UUID 비공개 가드 — 본 client 결과는 service 레이어 내부 검증용으로만 사용, 사용자 화면 직접 노출 X.
 */
@Component
public class UserClient implements UserVerifier {

    private final UserVerifier delegate;
    private final ServiceDiscoveryClient discoveryClient;

    public UserClient(RestClient.Builder builder,
                      ServiceDiscoveryClient discoveryClient,
                      @Value("${samhan.user-service.url:http://localhost:8083}") String baseUrl,
                      @Value("${samhan.user-client.fail-mode:OPEN}") UserVerifierProperties.FailMode failMode,
                      @Value("${app.security.internal.token:}") String internalToken,
                      UserCacheProperties cacheProperties) {
        this.discoveryClient = discoveryClient;
        UserVerifierProperties p = new UserVerifierProperties();
        p.setBaseUrl(baseUrl);
        p.setInternalToken(internalToken);
        p.setTtlSeconds(cacheProperties.getTtlSeconds());
        p.setMaxSize(cacheProperties.getMaxSize());
        p.setFailMode(failMode);
        this.delegate = new DefaultUserVerifier(builder, p);
    }

    @Override
    public boolean exists(UUID userId) {
        return delegate.exists(userId);
    }

    @Override
    public Map<UUID, Boolean> verifyBulk(List<UUID> userIds) {
        return delegate.verifyBulk(userIds);
    }

    @Override
    public void invalidateCache() {
        delegate.invalidateCache();
    }

    /** Phase 10 활성 대비 — discovery client 보유 검증 (현재 미사용). */
    public ServiceDiscoveryClient getDiscoveryClient() {
        return discoveryClient;
    }
}
