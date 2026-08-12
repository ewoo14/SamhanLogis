package com.samhanair.logis.product.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** 제품 공개 응답의 감사 사용자 UUID를 user-service 직원명으로 해석한다. */
@Component
public class UserInternalClient {

    private static final int CONNECT_TIMEOUT_MS = 100;
    private static final int READ_TIMEOUT_MS = 200;

    private final RestClient restClient;
    private final InternalAuthProperties authProperties;
    private final ObjectMapper objectMapper;

    @Autowired
    public UserInternalClient(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
            InternalAuthProperties authProperties,
            ObjectMapper objectMapper) {
        this(builder, authProperties, objectMapper, "http://user-service");
    }

    UserInternalClient(
            RestClient.Builder builder,
            InternalAuthProperties authProperties,
            ObjectMapper objectMapper,
            String userServiceBaseUrl) {
        var requestFactory = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        // 사용자 이름은 감사 표시 보조 데이터다. 조회 장애가 제품 상세를 막지 않도록
        // shared user-client-abstraction의 fail-soft timeout 기준(100/200ms)을 따른다.
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT_MS);
        requestFactory.setReadTimeout(READ_TIMEOUT_MS);
        this.restClient = builder.baseUrl(userServiceBaseUrl).requestFactory(requestFactory).build();
        this.authProperties = authProperties;
        this.objectMapper = objectMapper;
    }

    /** UUID 감사값을 직원 fullName으로 바꾼다. UUID가 아닌 기존 사람 표식은 그대로 보존한다. */
    public Optional<String> resolveDisplayName(String auditValue) {
        if (auditValue == null || auditValue.isBlank()) {
            return Optional.empty();
        }
        final UUID userId;
        try {
            userId = UUID.fromString(auditValue);
        } catch (IllegalArgumentException ignored) {
            if (isSystemMarker(auditValue)) {
                return Optional.empty();
            }
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

    /** 사람이 아닌 저장 표식은 호출자가 시스템 작업으로 표시할 수 있도록 해석 실패로 구분한다. */
    public static boolean isSystemMarker(String auditValue) {
        String value = auditValue == null ? "" : auditValue.trim();
        return value.equalsIgnoreCase("system")
                || value.equalsIgnoreCase("qa-seed")
                || value.matches("(?i)^V\\d+__.*")
                || value.matches("(?i).*(_MIGRATION|_BACKFILL)$")
                || value.matches("(?i).*\\b(MIGRATION|BACKFILL|SEED)\\b.*");
    }
}
