package com.samhanair.logis.groupware.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.approval.StepType;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import com.samhanair.logis.groupware.domain.ResolvedRole;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** auth-service 중앙 결재라인 config 조회 client. */
@Component
public class GroupwareApprovalLineConfigClient {

    private static final Logger log = LoggerFactory.getLogger(GroupwareApprovalLineConfigClient.class);
    private static final String AUTH_SERVICE_BASE = "http://auth-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    @Autowired
    public GroupwareApprovalLineConfigClient(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
            InternalAuthProperties internalAuthProperties,
            ObjectMapper objectMapper) {
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        rf.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
        this.restClient = builder
                .baseUrl(AUTH_SERVICE_BASE)
                .requestFactory(rf)
                .build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /** 테스트 전용 생성자 — MockRestServiceServer 에 바인딩된 RestClient 를 직접 주입한다. */
    GroupwareApprovalLineConfigClient(
            RestClient restClient,
            InternalAuthProperties internalAuthProperties,
            ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /** documentType 별 중앙 결재라인 역할을 조회한다. 호출/파싱 실패는 미설정으로 닫는다. */
    public ConfigLine fetchRoles(String documentType) {
        if (documentType == null || documentType.isBlank()) {
            return ConfigLine.unconfigured();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("그룹웨어 결재라인 config 조회용 internal token 미설정 — documentType={}", documentType);
            return ConfigLine.unconfigured();
        }
        try {
            String body = restClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/auth/internal/approval-line/roles")
                            .queryParam("documentType", documentType)
                            .build())
                    .header(HttpHeaderConstants.INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parse(body);
        } catch (Exception ex) {
            log.warn("그룹웨어 결재라인 config 조회 실패 — documentType={}, msg={}",
                    documentType, ex.getMessage());
            return ConfigLine.unconfigured();
        }
    }

    private ConfigLine parse(String body) {
        try {
            JsonNode root = objectMapper.readTree(body);
            if (!root.path("success").asBoolean(false) || !root.hasNonNull("data")) {
                return ConfigLine.unconfigured();
            }
            JsonNode data = root.get("data");
            if (!data.path("configured").asBoolean(false)) {
                return ConfigLine.unconfigured();
            }
            JsonNode rolesNode = data.get("roles");
            if (rolesNode == null || !rolesNode.isArray() || rolesNode.isEmpty()) {
                return ConfigLine.unconfigured();
            }
            List<ResolvedRole> roles = new ArrayList<>();
            for (JsonNode item : rolesNode) {
                roles.addAll(parseRole(item));
            }
            if (roles.isEmpty()) {
                return ConfigLine.unconfigured();
            }
            return new ConfigLine(true, List.copyOf(roles));
        } catch (Exception ex) {
            log.warn("결재라인 config 응답 파싱 실패 — msg={}", ex.getMessage(), ex);
            return ConfigLine.unconfigured();
        }
    }

    private List<ResolvedRole> parseRole(JsonNode item) {
        int sequence = item.path("sequence").asInt();
        StepType stepType = StepType.valueOf(item.path("stepType").asText());
        UUID groupId = readUuid(item.get("approverGroupId"));
        String requiredPageCode = readText(item.get("requiredPageCode"));
        List<UUID> userIds = readUuidArray(item.get("approverUserIds"));
        if (stepType == StepType.CREATOR) {
            return List.of(new ResolvedRole(sequence, StepType.CREATOR, null, null, null));
        }
        if (!userIds.isEmpty()) {
            return userIds.stream()
                    .map(userId -> new ResolvedRole(sequence, StepType.USER, userId, null, null))
                    .toList();
        }
        if (stepType == StepType.GROUP && groupId != null) {
            return List.of(new ResolvedRole(sequence, StepType.GROUP, null, groupId, requiredPageCode));
        }
        // USER + 빈 userIds 또는 GROUP + null groupId — 설정 항목 누락으로 드롭
        log.warn("결재라인 config 설정 항목 누락으로 드롭 — stepType={}, sequence={}, userIdsCount={}, groupId={}",
                stepType, sequence, userIds.size(), groupId);
        return List.of();
    }

    private List<UUID> readUuidArray(JsonNode node) {
        if (node == null || !node.isArray()) {
            return List.of();
        }
        List<UUID> values = new ArrayList<>();
        for (JsonNode item : node) {
            UUID uuid = readUuid(item);
            if (uuid != null) {
                values.add(uuid);
            }
        }
        return List.copyOf(values);
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
        String value = node.asText();
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** 중앙 결재라인 조회 결과. */
    public record ConfigLine(boolean configured, List<ResolvedRole> roles) {
        public ConfigLine {
            roles = roles == null ? List.of() : List.copyOf(roles);
        }

        public static ConfigLine unconfigured() {
            return new ConfigLine(false, List.of());
        }
    }
}
