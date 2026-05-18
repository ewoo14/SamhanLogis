package com.samhanair.logis.arologis.client;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * 동적 RBAC 권한 조회 클라이언트 구현체 — SP-D3 arologis-service 이식.
 *
 * <p>auth-service 의 {@code /auth/admin/permissions/check} endpoint 를 호출하여
 * 특정 역할의 특정 페이지 접근 가능 여부를 확인한다.
 *
 * <p>응답 파싱 정책:
 * auth-service 는 {@code ApiResponse<PermissionCheckResponse>} 래퍼로 응답한다.
 * 실제 허용 여부는 {@code data.allowed} 필드이므로 {@link JsonNode} 를 통해
 * 래퍼를 벗겨 {@code data.allowed} 를 읽는다.
 *
 * <p>장애 격리 정책:
 * <ul>
 *   <li>auth-service 다운 또는 네트워크 오류 → {@code false} 반환 (보수적 fallback)</li>
 *   <li>4xx (404 override row 미존재, 403 권한 없음) → {@code false} 반환</li>
 *   <li>data 또는 allowed 필드 파싱 실패 → {@code false} 반환</li>
 * </ul>
 *
 * <p>arologis-service 는 {@code restClientBuilder} (LoadBalancer 없는 기본 빌더) 를 사용.
 * auth-service URL 은 환경변수 또는 Eureka 를 통해 해석.
 *
 * <p>IT 에서 {@code @MockBean} 으로 격리 필요 (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 */
@Component
public class DynamicPermissionClientImpl implements DynamicPermissionClient {

    private static final Logger log = LoggerFactory.getLogger(DynamicPermissionClientImpl.class);
    private static final String AUTH_SERVICE_BASE = "http://auth-service";

    private final RestClient restClient;

    /**
     * {@code restClientBuilder} bean 을 주입받아 auth-service 로의 RestClient 를 생성한다.
     *
     * @param builder arologis-service WebClientConfig 에서 제공하는 기본 빌더
     */
    public DynamicPermissionClientImpl(RestClient.Builder builder) {
        this.restClient = builder.baseUrl(AUTH_SERVICE_BASE).build();
    }

    /**
     * {@inheritDoc}
     *
     * <p>auth-service {@code GET /auth/admin/permissions/check?roleCode=&pageCode=&type=EDIT} 호출.
     */
    @Override
    public boolean canEdit(String roleCode, String pageCode) {
        return checkPermission(roleCode, pageCode, "EDIT");
    }

    /**
     * {@inheritDoc}
     *
     * <p>auth-service {@code GET /auth/admin/permissions/check?roleCode=&pageCode=&type=VIEW} 호출.
     */
    @Override
    public boolean canView(String roleCode, String pageCode) {
        return checkPermission(roleCode, pageCode, "VIEW");
    }

    /**
     * auth-service {@code /auth/admin/permissions/check} 를 호출하여 권한 여부 반환.
     *
     * @param roleCode 역할 코드
     * @param pageCode 페이지 코드
     * @param permType "VIEW" 또는 "EDIT"
     * @return 권한 허용 여부 (파싱 실패 또는 장애 시 false)
     */
    private boolean checkPermission(String roleCode, String pageCode, String permType) {
        try {
            JsonNode root = restClient.get()
                    .uri("/auth/admin/permissions/check?roleCode={role}&pageCode={page}&type={type}",
                            roleCode, pageCode, permType)
                    .retrieve()
                    .onStatus(status -> status.is4xxClientError(), (req, res) -> {
                        log.debug("[SP-D3] 권한 조회 4xx — roleCode={} pageCode={} type={} status={}",
                                roleCode, pageCode, permType, res.getStatusCode());
                    })
                    .body(JsonNode.class);

            if (root == null) {
                return false;
            }
            JsonNode dataNode = root.path("data");
            if (dataNode.isMissingNode() || dataNode.isNull()) {
                log.debug("[SP-D3] 권한 조회 응답 data 필드 누락 — roleCode={} pageCode={} type={}",
                        roleCode, pageCode, permType);
                return false;
            }
            JsonNode allowedNode = dataNode.path("allowed");
            if (allowedNode.isMissingNode()) {
                log.debug("[SP-D3] 권한 조회 응답 data.allowed 필드 누락 — roleCode={} pageCode={} type={}",
                        roleCode, pageCode, permType);
                return false;
            }
            return allowedNode.asBoolean(false);
        } catch (RestClientException ex) {
            log.warn("[SP-D3] auth-service 권한 조회 실패 (fallback=false) — roleCode={} pageCode={} error={}",
                    roleCode, pageCode, ex.getMessage());
            return false;
        } catch (Exception ex) {
            log.error("[SP-D3] 동적 권한 조회 예외 (fallback=false) — roleCode={} pageCode={} error={}",
                    roleCode, pageCode, ex.getMessage(), ex);
            return false;
        }
    }
}
