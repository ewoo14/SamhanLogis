package com.samhanair.logis.arologis.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.common.http.HttpHeaderConstants;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

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
 *
 * <p><b>에러 매핑</b>: auth-service 가 4xx(검증 실패·권한 거부 등)를 반환하면 status/본문 메시지를
 * 보존하여 동등한 {@link ErrorCode}(BAD_REQUEST→INVALID_INPUT, FORBIDDEN, NOT_FOUND, CONFLICT 등)와
 * 원 메시지로 변환한다. 5xx·연결 오류만 {@link ErrorCode#INTERNAL_ERROR}(500) 로 일반화한다.
 * 모든 4xx 를 500 으로 뭉개면 사용자 입력 오류가 서버 오류로 둔갑하므로 신뢰경계를 명확히 한다.
 */
@Slf4j
@Component
public class AuthPermissionAdminClientImpl implements AuthPermissionAdminClient {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String ROLE_HEADER = "X-User-Role";

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final String internalToken;
    private final String callerServiceName;
    private final String gatewayAttestation;

    public AuthPermissionAdminClientImpl(
            RestClient.Builder builder,
            ObjectMapper objectMapper,
            String authServiceBaseUrl,
            String internalToken,
            String callerServiceName) {
        this(builder, objectMapper, authServiceBaseUrl, internalToken, callerServiceName, "");
    }

    @Autowired
    public AuthPermissionAdminClientImpl(
            RestClient.Builder builder,
            ObjectMapper objectMapper,
            @Value("${samhan.auth-service.url:http://localhost:8081}") String authServiceBaseUrl,
            @Value("${app.security.internal.token:}") String internalToken,
            @Value("${spring.application.name:arologis-service}") String callerServiceName,
            @Value("${samhan.security.gateway-attestation:}") String gatewayAttestation) {
        String baseUrl = (authServiceBaseUrl == null || authServiceBaseUrl.isBlank())
                ? "http://localhost:8081"
                : authServiceBaseUrl;
        this.restClient = builder.baseUrl(baseUrl).build();
        this.objectMapper = objectMapper;
        this.internalToken = internalToken == null ? "" : internalToken;
        this.callerServiceName = (callerServiceName == null || callerServiceName.isBlank())
                ? "arologis-service" : callerServiceName;
        this.gatewayAttestation = gatewayAttestation == null ? "" : gatewayAttestation;
    }

    @Override
    public Map<String, Map<String, RolePagePermissionView>> getRoleMatrix(String pagePrefix) {
        try {
            JsonNode root = restClient.get()
                    .uri("/auth/internal/permissions/role-matrix?pagePrefix={prefix}", pagePrefix)
                    .header(INTERNAL_TOKEN_HEADER, internalToken)
                    .header(USER_ID_HEADER, "system-internal:" + callerServiceName)
                    .header(ROLE_HEADER, callerServiceName)
                    .headers(this::addGatewayAttestation)
                    .retrieve()
                    .body(JsonNode.class);
            return parseMatrix(root);
        } catch (RestClientResponseException ex) {
            log.warn("[ArologisPhaseA] 권한 매트릭스 조회 응답 오류 — pagePrefix={} status={} body={}",
                    pagePrefix, ex.getStatusCode(), ex.getResponseBodyAsString());
            throw toBusinessException(ex, "권한 매트릭스 조회에 실패했습니다.");
        } catch (RestClientException ex) {
            log.warn("[ArologisPhaseA] 권한 매트릭스 조회 실패 — pagePrefix={} error={}",
                    pagePrefix, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "권한 매트릭스 조회에 실패했습니다.");
        }
    }

    @Override
    public RolePagePermissionView updateRoleGrant(
            String roleCode, String pageCode, boolean canView, boolean canEdit, String actorUserId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("roleCode", roleCode);
        body.put("pageCode", pageCode);
        body.put("canView", canView);
        body.put("canEdit", canEdit);
        try {
            JsonNode root = restClient.put()
                    .uri("/auth/internal/permissions/role-grant")
                    .header(INTERNAL_TOKEN_HEADER, internalToken)
                    .header(USER_ID_HEADER, resolveActorHeader(actorUserId))
                    .header(ROLE_HEADER, callerServiceName)
                    .headers(this::addGatewayAttestation)
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
        } catch (RestClientResponseException ex) {
            log.warn("[ArologisPhaseA] 권한 할당 응답 오류 — roleCode={} pageCode={} status={} body={}",
                    roleCode, pageCode, ex.getStatusCode(), ex.getResponseBodyAsString());
            throw toBusinessException(ex, "권한 할당에 실패했습니다.");
        } catch (RestClientException ex) {
            log.warn("[ArologisPhaseA] 권한 할당 실패 — roleCode={} pageCode={} error={}",
                    roleCode, pageCode, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "권한 할당에 실패했습니다.");
        }
    }

    /**
     * X-User-Id 헤더 값 결정 — 실 actor 우선, 미존재 시 service-internal 식별자 폴백.
     *
     * <p>게이트웨이/JwtFilter 가 주입한 실 사용자 식별자를 그대로 전파하여 auth 감사 기록이 실제
     * 변경자를 가리키도록 한다. blank/null 인 경우에만 호출 서비스 식별자로 폴백한다.
     *
     * @param actorUserId 호출 컨트롤러가 전달한 실 actor (null 가능)
     * @return X-User-Id 헤더로 보낼 값
     */
    private String resolveActorHeader(String actorUserId) {
        if (actorUserId != null && !actorUserId.isBlank()) {
            return actorUserId;
        }
        return "system-internal:" + callerServiceName;
    }

    private void addGatewayAttestation(org.springframework.http.HttpHeaders headers) {
        if (!gatewayAttestation.isBlank()) {
            headers.set(HttpHeaderConstants.GATEWAY_ATTESTATION_HEADER, gatewayAttestation);
        }
    }

    /**
     * auth-service RestClient 응답 오류를 {@link BusinessException} 으로 변환한다.
     *
     * <p>4xx 는 status 별 {@link ErrorCode} 와 원 본문 메시지를 보존하여 사용자 입력/권한 오류가
     * 그대로 전달되게 하고, 5xx 는 {@link ErrorCode#INTERNAL_ERROR}(+ 기본 메시지) 로 일반화한다.
     *
     * @param ex             RestClient 응답 예외
     * @param fallbackMessage 본문 메시지가 비어 있을 때 사용할 기본 메시지
     * @return 매핑된 BusinessException
     */
    private BusinessException toBusinessException(
            RestClientResponseException ex, String fallbackMessage) {
        HttpStatusCode status = ex.getStatusCode();
        if (status.is4xxClientError()) {
            String message = extractMessage(ex.getResponseBodyAsString(), fallbackMessage);
            return new BusinessException(mapClientErrorCode(status), message);
        }
        return new BusinessException(ErrorCode.INTERNAL_ERROR, fallbackMessage);
    }

    /**
     * 4xx HTTP status 를 동등 {@link ErrorCode} 로 매핑.
     *
     * @param status 4xx status code
     * @return 매핑된 ErrorCode (미정의 4xx 는 INVALID_INPUT 으로 보수 매핑)
     */
    private ErrorCode mapClientErrorCode(HttpStatusCode status) {
        return switch (status.value()) {
            case 401 -> ErrorCode.UNAUTHORIZED;
            case 403 -> ErrorCode.FORBIDDEN;
            case 404 -> ErrorCode.NOT_FOUND;
            case 409 -> ErrorCode.CONFLICT;
            case 422 -> ErrorCode.UNPROCESSABLE_ENTITY;
            case 429 -> ErrorCode.TOO_MANY_REQUESTS;
            default -> ErrorCode.INVALID_INPUT;
        };
    }

    /**
     * auth-service {@code ApiResponse} 오류 본문에서 사람 메시지를 추출.
     *
     * <p>{@code {"message": "..."}} 또는 {@code {"error": {"message": "..."}}} 형태를 모두 시도하고,
     * 파싱 실패·빈 메시지면 {@code fallbackMessage} 를 사용한다.
     *
     * @param body            응답 본문 문자열
     * @param fallbackMessage 추출 실패 시 기본 메시지
     * @return 보존할 메시지
     */
    private String extractMessage(String body, String fallbackMessage) {
        if (body == null || body.isBlank()) {
            return fallbackMessage;
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            String message = text(root, "message");
            if (message == null) {
                JsonNode error = root.path("error");
                if (error.isObject()) {
                    message = text(error, "message");
                }
            }
            return (message == null || message.isBlank()) ? fallbackMessage : message;
        } catch (Exception parseEx) {
            return fallbackMessage;
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
