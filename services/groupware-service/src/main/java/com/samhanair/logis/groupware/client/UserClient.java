package com.samhanair.logis.groupware.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.discovery.ServiceDiscoveryClient;
import com.samhanair.logis.userclient.DefaultUserVerifier;
import com.samhanair.logis.userclient.UserVerifier;
import com.samhanair.logis.userclient.UserVerifierProperties;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

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

    private static final Logger log = LoggerFactory.getLogger(UserClient.class);

    private final UserVerifier delegate;
    private final ServiceDiscoveryClient discoveryClient;
    private final RestClient restClient;
    private final String internalToken;
    private final ObjectMapper objectMapper;

    public record ApproverSummary(UUID userId, String name, String department, String employeeCode) {
        /** 담당자코드가 없는 하위호환 생성자 (결재자 picker 등 기존 소비처). */
        public ApproverSummary(UUID userId, String name, String department) {
            this(userId, name, department, null);
        }
    }

    public record UserProfile(String name, String department, String employeeCode) {}

    /** 채팅 화면 표시용 직원 정보. 내부 UUID는 반환하지 않는다. */
    public Optional<UserProfile> resolveProfile(UUID userId) {
        if (userId == null || internalToken == null || internalToken.isBlank()) return Optional.empty();
        try {
            String body = restClient.get().uri("/internal/users/{userId}", userId)
                    .header("X-Internal-Token", internalToken).retrieve().body(String.class);
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            String name = readText(data.get("fullName"));
            if (name == null) return Optional.empty();
            return Optional.of(new UserProfile(name, readText(data.get("departmentName")), readText(data.get("ecountCode"))));
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    /** employeeCode는 사용자 경계의 업무 식별자이고 UUID 해석은 service 내부에서만 수행한다. */
    public Optional<UUID> resolveUserIdByEmployeeCode(String employeeCode) {
        if (employeeCode == null || employeeCode.isBlank() || internalToken == null || internalToken.isBlank()) return Optional.empty();
        try {
            String body = restClient.get().uri(uriBuilder -> uriBuilder.path("/internal/users/by-employee-code")
                            .queryParam("employeeCode", employeeCode).build())
                    .header("X-Internal-Token", internalToken).retrieve().body(String.class);
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            return Optional.ofNullable(readUuid(data.get("userId")));
        } catch (Exception ex) {
            return Optional.empty();
        }
    }

    public UserClient(RestClient.Builder builder,
                      ServiceDiscoveryClient discoveryClient,
                      @Value("${samhan.user-service.url:http://localhost:8083}") String baseUrl,
                      @Value("${samhan.user-client.fail-mode:OPEN}") UserVerifierProperties.FailMode failMode,
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

    /** 메신저 발송 직전 재직 상태를 user-service에서 캐시 없이 일괄 확인한다. */
    public Map<UUID, Boolean> verifyActiveBulk(List<UUID> userIds) {
        if (userIds == null || userIds.isEmpty() || internalToken == null || internalToken.isBlank()) {
            return Map.of();
        }
        List<UUID> distinct = userIds.stream()
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        if (distinct.isEmpty()) {
            return Map.of();
        }
        try {
            String body = restClient.post()
                    .uri("/internal/users/verify-active-bulk")
                    .header("X-Internal-Token", internalToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("userIds", distinct))
                    .retrieve()
                    .body(String.class);
            return parseBooleanMap(body);
        } catch (Exception ex) {
            // 발송 자격 검증은 fail-closed: user-service 장애 중 퇴사자에게 발송하지 않는다.
            log.error("user-service verify-active-bulk 호출 실패 — endpoint=/internal/users/verify-active-bulk, "
                    + "userIdsCount={}, fail-closed", distinct.size(), ex);
            return distinct.stream().collect(java.util.stream.Collectors.toMap(id -> id, id -> false));
        }
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

    /** 결재자 검색. user-service 장애/토큰 미설정 시 빈 배열로 fail-soft 처리한다. */
    public List<ApproverSummary> search(String q, int limit) {
        return search(q, limit, false);
    }

    /**
     * 직원 검색. activeOnly=true인 경우 퇴사일이 없는 재직자만 반환하도록 user-service에 전달한다.
     *
     * @param q 검색어
     * @param limit 반환 상한
     * @param activeOnly 퇴사자 제외 여부
     * @return 검색 결과
     */
    public List<ApproverSummary> search(String q, int limit, boolean activeOnly) {
        String normalized = q == null ? "" : q.trim();
        if (normalized.isBlank() || internalToken == null || internalToken.isBlank()) {
            return List.of();
        }
        int normalizedLimit = Math.min(Math.max(limit, 1), 50);
        try {
            String body = restClient.get()
                    .uri(uriBuilder -> {
                        var builder = uriBuilder.path("/internal/users/search")
                                .queryParam("q", normalized)
                                .queryParam("limit", normalizedLimit);
                        if (activeOnly) {
                            builder.queryParam("activeOnly", true);
                        }
                        return builder.build();
                    })
                    .header("X-Internal-Token", internalToken)
                    .retrieve()
                    .body(String.class);
            if (body == null || body.isBlank()) {
                return List.of();
            }
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || !data.isArray()) {
                return List.of();
            }
            java.util.ArrayList<ApproverSummary> result = new java.util.ArrayList<>();
            for (JsonNode item : data) {
                UUID userId = readUuid(item.get("userId"));
                String fullName = readText(item.get("fullName"));
                if (userId == null || fullName == null) {
                    continue;
                }
                result.add(new ApproverSummary(userId, fullName, readText(item.get("departmentName")),
                        readText(item.get("ecountCode"))));
            }
            return List.copyOf(result);
        } catch (RestClientResponseException ex) {
            return List.of();
        } catch (Exception ex) {
            return List.of();
        }
    }

    /** UUID 목록의 표시명을 fail-soft 로 해석한다. 누락/실패 항목은 결과 map 에 포함하지 않는다. */
    public Map<UUID, String> resolveDisplayNames(List<UUID> ids) {
        if (ids == null || ids.isEmpty() || internalToken == null || internalToken.isBlank()) {
            return Map.of();
        }
        List<UUID> distinct = ids.stream()
                .filter(java.util.Objects::nonNull)
                .distinct()
                .toList();
        if (distinct.isEmpty()) {
            return Map.of();
        }
        try {
            String body = restClient.post()
                    .uri("/internal/users/display-names")
                    .header("X-Internal-Token", internalToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("userIds", distinct))
                    .retrieve()
                    .body(String.class);
            if (body == null || body.isBlank()) {
                return Map.of();
            }
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || !data.isObject()) {
                return Map.of();
            }
            Map<UUID, String> result = new LinkedHashMap<>();
            data.fieldNames().forEachRemaining(idText -> {
                try {
                    UUID id = UUID.fromString(idText);
                    String name = readText(data.get(idText));
                    if (name != null) {
                        result.put(id, name);
                    }
                } catch (IllegalArgumentException ignored) {
                    // malformed response key: skip
                }
            });
            return Map.copyOf(result);
        } catch (RestClientResponseException ex) {
            return Map.of();
        } catch (Exception ex) {
            return Map.of();
        }
    }

    private Map<UUID, Boolean> parseBooleanMap(String body) {
        if (body == null || body.isBlank()) {
            return Map.of();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            JsonNode exists = data == null ? null : data.get("exists");
            if (exists == null || !exists.isObject()) {
                return Map.of();
            }
            Map<UUID, Boolean> result = new LinkedHashMap<>();
            exists.fieldNames().forEachRemaining(idText -> {
                try {
                    result.put(UUID.fromString(idText), exists.get(idText).asBoolean(false));
                } catch (IllegalArgumentException ignored) {
                    // malformed response key: skip
                }
            });
            return result;
        } catch (Exception ex) {
            return Map.of();
        }
    }

    private UUID readUuid(JsonNode node) {
        String value = readText(node);
        if (value == null) {
            return null;
        }
        try {
            return UUID.fromString(value);
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private String readText(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        String text = node.asText();
        return text == null || text.isBlank() ? null : text.trim();
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
