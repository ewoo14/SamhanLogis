package com.samhanair.logis.arologis.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * {@link AuthPermissionAdminClient} 기본 구현체 — auth-service 내부 권한 엔드포인트 RestClient 호출.
 *
 * <p>{@code DynamicPermissionClientConfig} 와 동일한 auth-service URL/internalToken 설정을 재사용하여
 * {@code X-Internal-Token} 헤더로 게이트된 {@code /auth/internal/permissions/role-matrix} /
 * {@code role-grant} 를 호출한다. 응답은 {@code ApiResponse<...>} 래퍼이므로 {@code data} 를 벗겨
 * 파싱한다.
 *
 * <p>장애 시 보수적으로 처리하지 않고 {@link BusinessException} 으로 전파한다 — 권한 관리 화면은
 * 읽기/쓰기 결과가 명확해야 하므로 실패를 숨기지 않는다.
 */
@Slf4j
@Component
public class AuthPermissionAdminClientImpl implements AuthPermissionAdminClient {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";

    private final RestClient restClient;
    private final String internalToken;
    private final String callerServiceName;

    public AuthPermissionAdminClientImpl(
            RestClient.Builder builder,
            @Value("${samhan.auth-service.url:http://localhost:8081}") String authServiceBaseUrl,
            @Value("${app.security.internal.token:}") String internalToken,
            @Value("${spring.application.name:arologis-service}") String callerServiceName) {
        String baseUrl = (authServiceBaseUrl == null || authServiceBaseUrl.isBlank())
                ? "http://localhost:8081"
                : authServiceBaseUrl;
        this.restClient = builder.baseUrl(baseUrl).build();
        this.internalToken = internalToken == null ? "" : internalToken;
        this.callerServiceName = (callerServiceName == null || callerServiceName.isBlank())
                ? "arologis-service" : callerServiceName;
    }

    @Override
    public Map<String, Map<String, RolePagePermissionView>> getRoleMatrix(String pagePrefix) {
        try {
            JsonNode root = restClient.get()
                    .uri("/auth/internal/permissions/role-matrix?pagePrefix={prefix}", pagePrefix)
                    .header(INTERNAL_TOKEN_HEADER, internalToken)
                    .header(USER_ID_HEADER, "system-internal:" + callerServiceName)
                    .header(ROLE_HEADER, callerServiceName)
                    .retrieve()
                    .body(JsonNode.class);
            return parseMatrix(root);
        } catch (RestClientException ex) {
            log.warn("[ArologisPhaseA] 권한 매트릭스 조회 실패 — pagePrefix={} error={}",
                    pagePrefix, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "권한 매트릭스 조회에 실패했습니다.");
        }
    }

    @Override
    public RolePagePermissionView updateRoleGrant(
            String roleCode, String pageCode, boolean canView, boolean canEdit) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("roleCode", roleCode);
        body.put("pageCode", pageCode);
        body.put("canView", canView);
        body.put("canEdit", canEdit);
        try {
            JsonNode root = restClient.put()
                    .uri("/auth/internal/permissions/role-grant")
                    .header(INTERNAL_TOKEN_HEADER, internalToken)
                    .header(USER_ID_HEADER, "system-internal:" + callerServiceName)
                    .header(ROLE_HEADER, callerServiceName)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            JsonNode data = root == null ? null : root.path("data");
            if (data == null || data.isMissingNode() || data.isNull()) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "권한 할당 응답이 비어 있습니다.");
            }
            return toView(data);
        } catch (RestClientException ex) {
            log.warn("[ArologisPhaseA] 권한 할당 실패 — roleCode={} pageCode={} error={}",
                    roleCode, pageCode, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "권한 할당에 실패했습니다.");
        }
    }

    private Map<String, Map<String, RolePagePermissionView>> parseMatrix(JsonNode root) {
        Map<String, Map<String, RolePagePermissionView>> matrix = new LinkedHashMap<>();
        JsonNode data = root == null ? null : root.path("data");
        if (data == null || !data.isObject()) {
            return matrix;
        }
        for (Iterator<Map.Entry<String, JsonNode>> roles = data.fields(); roles.hasNext();) {
            Map.Entry<String, JsonNode> roleEntry = roles.next();
            JsonNode pageMapNode = roleEntry.getValue();
            if (pageMapNode == null || !pageMapNode.isObject()) {
                continue;
            }
            Map<String, RolePagePermissionView> pageMap = new LinkedHashMap<>();
            for (Iterator<Map.Entry<String, JsonNode>> pages = pageMapNode.fields(); pages.hasNext();) {
                Map.Entry<String, JsonNode> pageEntry = pages.next();
                pageMap.put(pageEntry.getKey(), toView(pageEntry.getValue()));
            }
            matrix.put(roleEntry.getKey(), pageMap);
        }
        return matrix;
    }

    private RolePagePermissionView toView(JsonNode node) {
        return new RolePagePermissionView(
                text(node, "roleCode"),
                text(node, "pageCode"),
                text(node, "displayName"),
                node.path("canView").asBoolean(false),
                node.path("canEdit").asBoolean(false));
    }

    private String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isMissingNode() || v.isNull() ? null : v.asText();
    }
}
