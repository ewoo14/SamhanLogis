package com.samhanair.logis.product.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** 제품 공개 응답의 감사 사용자 UUID를 user-service 직원명으로 해석한다. */
@Component
public class UserInternalClient {

    private final RestClient restClient;
    private final InternalAuthProperties authProperties;
    private final ObjectMapper objectMapper;

    public UserInternalClient(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
            InternalAuthProperties authProperties,
            ObjectMapper objectMapper) {
        var requestFactory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        requestFactory.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
        this.restClient = builder.baseUrl("http://user-service").requestFactory(requestFactory).build();
        this.authProperties = authProperties;
        this.objectMapper = objectMapper;
    }

    /** UUID 감사값을 직원 fullName으로 바꾼다. UUID가 아닌 기존 seed 값은 그대로 보존한다. */
    public Optional<String> resolveDisplayName(String auditValue) {
        if (auditValue == null || auditValue.isBlank()) {
            return Optional.empty();
        }
        final UUID userId;
        try {
            userId = UUID.fromString(auditValue);
        } catch (IllegalArgumentException ignored) {
            return Optional.of(auditValue);
        }
        String token = authProperties.getToken();
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        try {
            String body = restClient.get()
                    .uri("/internal/users/{userId}", userId)
                    .header("X-Internal-Token", token)
                    .retrieve()
                    .body(String.class);
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            JsonNode fullName = data == null ? null : data.get("fullName");
            return fullName == null || fullName.isNull() || fullName.asText().isBlank()
                    ? Optional.empty()
                    : Optional.of(fullName.asText().trim());
        } catch (Exception ignored) {
            return Optional.empty();
        }
    }
}
