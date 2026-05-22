package com.samhanair.logis.groupware.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.discovery.ServiceDiscoveryClient;
import com.samhanair.logis.userclient.DefaultUserVerifier;
import com.samhanair.logis.userclient.UserVerifier;
import com.samhanair.logis.userclient.UserVerifierProperties;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * user-service 호출 client — groupware-service local wrapper.
 *
 * <p>Phase 9 W4 — W3 backlog #1 채택. 기존 in-class RestClient + bulk verify 구현을
 * {@code shared:user-client-abstraction} 모듈의 {@link DefaultUserVerifier} 로 위임.
 * IT 의 {@code @MockBean UserClient} 패턴은 그대로 유지 (회귀 0).
 *
 * <p>본 wrapper 도입으로 W3 시점 BE backlog #1 (Caffeine 적용 일관성) 까지 자동 충족
 * — groupware 측에 누락되었던 cache 가 본 abstraction 에 내장되어 일관 적용.
 *
 * <p>ServiceDiscoveryClient 두 번째 소비자 유지. UUID 비공개 가드 — 본 client 결과는 service
 * 레이어 내부 검증용으로만 사용.
 */
@Component
public class UserClient implements UserVerifier {

    private final UserVerifier delegate;
    private final ServiceDiscoveryClient discoveryClient;
    private final RestClient restClient;
    private final String internalToken;
    private final ObjectMapper objectMapper;

    public UserClient(RestClient.Builder builder,
                      ServiceDiscoveryClient discoveryClient,
                      @Value("${samhan.user-service.url:http://localhost:8083}") String baseUrl,
                      @Value("${app.security.internal.token:}") String internalToken,
                      ObjectMapper objectMapper) {
        this.discoveryClient = discoveryClient;
        this.restClient = builder.baseUrl(baseUrl).build();
        this.internalToken = internalToken;
        this.objectMapper = objectMapper;
        UserVerifierProperties p = new UserVerifierProperties();
        p.setBaseUrl(baseUrl);
        p.setInternalToken(internalToken);
        p.setTtlSeconds(60L);
        p.setMaxSize(10000L);
        p.setFailFast(false);
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

    /**
     * 발신자 표시명 조회. 알림 title 에 user UUID 가 노출되지 않도록 fullName 을 fail-soft 로 반환한다.
     *
     * @param userId user-service 직원 UUID
     * @return fullName. 미존재 / 호출 실패 / 응답 누락 시 empty.
     */
    public Optional<String> resolveDisplayName(UUID userId) {
        if (userId == null || internalToken == null || internalToken.isBlank()) {
            return Optional.empty();
        }
        try {
            String body = restClient.get()
                    .uri("/internal/users/{userId}", userId)
                    .header("X-Internal-Token", internalToken)
                    .retrieve()
                    .body(String.class);
            if (body == null || body.isBlank()) {
                return Optional.empty();
            }
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || data.isNull()) {
                return Optional.empty();
            }
            JsonNode fullNameNode = data.get("fullName");
            if (fullNameNode == null || fullNameNode.isNull() || fullNameNode.asText().isBlank()) {
                return Optional.empty();
            }
            return Optional.of(fullNameNode.asText().trim());
        } catch (RestClientResponseException ex) {
            return Optional.empty();
        } catch (Exception ex) {
            return Optional.empty();
        }
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
