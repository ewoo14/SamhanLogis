package com.samhanair.logis.security.permission;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * 동적 RBAC 권한 조회 클라이언트 기본 구현체 — SP-D6 통합.
 *
 * <p>SP-D1~D5 까지 9 service (accounting/arologis/inventory/notification/partner-order/partner/
 * product/slip/user) 가 자체 패키지에 중복 정의하던 동일 구현을 {@code shared:security} 로
 * 일원화한다.
 *
 * <p>auth-service 의 {@code /auth/internal/permissions/check} endpoint 를 호출하여
 * 특정 역할의 특정 페이지 접근 가능 여부를 확인한다.
 *
 * <p>응답 파싱 정책: auth-service 는 {@code ApiResponse<PermissionCheckResponse>} 래퍼로
 * 응답한다. 실제 허용 여부는 {@code data.allowed} 필드이므로 {@link JsonNode} 를 통해 래퍼를
 * 벗겨 {@code data.allowed} 를 읽는다.
 *
 * <p>장애 격리 정책:
 * <ul>
 *   <li>auth-service 다운 또는 네트워크 오류 → {@code false} 반환 (보수적 fallback)</li>
 *   <li>4xx (404 override row 미존재, 403 권한 없음) → {@code false} 반환</li>
 *   <li>data 또는 allowed 필드 파싱 실패 → {@code false} 반환</li>
 * </ul>
 *
 * <p>등록은 {@link PermissionSecurityAutoConfiguration#defaultDynamicPermissionClient} 가
 * 담당한다. 소비자 service 가 자체 {@link DynamicPermissionClient} bean 을 정의한 경우
 * {@code @ConditionalOnMissingBean} 에 의해 본 기본 구현은 비활성화된다.
 *
 * @since SP-D6
 */
public class DefaultDynamicPermissionClient implements DynamicPermissionClient {

    private static final Logger log = LoggerFactory.getLogger(DefaultDynamicPermissionClient.class);
    private static final String AUTH_SERVICE_BASE = "http://auth-service";
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";

    private final RestClient restClient;
    private final String internalToken;
    private final String callerServiceName;

    public DefaultDynamicPermissionClient(RestClient.Builder loadBalancedBuilder, String internalToken, String callerServiceName) {
        this(loadBalancedBuilder, AUTH_SERVICE_BASE, internalToken, callerServiceName);
    }

    public DefaultDynamicPermissionClient(
            RestClient.Builder builder,
            String authServiceBaseUrl,
            String internalToken,
            String callerServiceName) {
        String baseUrl = (authServiceBaseUrl == null || authServiceBaseUrl.isBlank())
                ? AUTH_SERVICE_BASE
                : authServiceBaseUrl;
        this.restClient = builder.baseUrl(baseUrl).build();
        this.internalToken = internalToken;
        this.callerServiceName = (callerServiceName == null || callerServiceName.isBlank()) ? "unknown" : callerServiceName;
    }

    @Override
    public boolean canEdit(String roleCode, String pageCode) {
        return checkPermission(roleCode, pageCode, "EDIT");
    }

    @Override
    public boolean canView(String roleCode, String pageCode) {
        return checkPermission(roleCode, pageCode, "VIEW");
    }

    private boolean checkPermission(String roleCode, String pageCode, String permType) {
        try {
            JsonNode root = restClient.get()
                    .uri("/auth/internal/permissions/check?roleCode={role}&pageCode={page}&type={type}",
                            roleCode, pageCode, permType)
                    .header(INTERNAL_TOKEN_HEADER, internalToken == null ? "" : internalToken)
                    // legacy alias 호환과 호출자 추적을 위해 X-User-* 헤더도 함께 전달한다.
                    .header("X-User-Id", "system-internal:" + callerServiceName)
                    .header("X-User-Role", roleCode)
                    .retrieve()
                    .onStatus(status -> status.is4xxClientError(), (req, res) -> {
                        log.debug("[SP-D6] 권한 조회 4xx — roleCode={} pageCode={} type={} status={}",
                                roleCode, pageCode, permType, res.getStatusCode());
                    })
                    .body(JsonNode.class);

            if (root == null) {
                return false;
            }
            JsonNode dataNode = root.path("data");
            if (dataNode.isMissingNode() || dataNode.isNull()) {
                log.debug("[SP-D6] 권한 조회 응답 data 필드 누락 — roleCode={} pageCode={} type={}",
                        roleCode, pageCode, permType);
                return false;
            }
            JsonNode allowedNode = dataNode.path("allowed");
            if (allowedNode.isMissingNode()) {
                log.debug("[SP-D6] 권한 조회 응답 data.allowed 필드 누락 — roleCode={} pageCode={} type={}",
                        roleCode, pageCode, permType);
                return false;
            }
            return allowedNode.asBoolean(false);
        } catch (RestClientException ex) {
            log.warn("[SP-D6] auth-service 권한 조회 실패 (fallback=false) — roleCode={} pageCode={} error={}",
                    roleCode, pageCode, ex.getMessage());
            return false;
        } catch (Exception ex) {
            log.error("[SP-D6] 동적 권한 조회 예외 (fallback=false) — roleCode={} pageCode={} error={}",
                    roleCode, pageCode, ex.getMessage(), ex);
            return false;
        }
    }
}
