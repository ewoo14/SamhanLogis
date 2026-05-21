package com.samhanair.logis.inventory.client;

import com.samhanair.logis.security.permission.DynamicPermissionClient;
import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * 동적 RBAC 권한 조회 클라이언트 구현체 — SP-D4 inventory-service 이식.
 *
 * <p>auth-service 의 {@code /auth/admin/permissions/check} endpoint 를 호출하여
 * 특정 역할의 특정 페이지 접근 가능 여부를 확인한다.
 *
 * <p>장애 격리 정책:
 * auth-service 다운, 4xx, 파싱 실패 시 모두 {@code false} 반환 (보수적 fallback).
 * 기존 {@code @PreAuthorize} 가드가 이미 통과된 이후 추가 레이어.
 *
 * <p>IT 에서 {@code @MockBean} 으로 격리 필요 (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 */
@Component
public class DynamicPermissionClientImpl implements DynamicPermissionClient {

    private static final Logger log = LoggerFactory.getLogger(DynamicPermissionClientImpl.class);
    private static final String AUTH_SERVICE_BASE = "http://auth-service";

    private final RestClient restClient;

    /**
     * {@code loadBalancedRestClientBuilder} bean 을 주입받아 auth-service 로의
     * load-balanced RestClient 를 생성한다.
     *
     * @param builder Spring Cloud LoadBalancer 통합 빌더
     */
    public DynamicPermissionClientImpl(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder) {
        this.restClient = builder.baseUrl(AUTH_SERVICE_BASE).build();
    }

    /** {@inheritDoc} */
    @Override
    public boolean canEdit(String roleCode, String pageCode) {
        return checkPermission(roleCode, pageCode, "EDIT");
    }

    /** {@inheritDoc} */
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
                        log.debug("[SP-D4] 권한 조회 4xx — roleCode={} pageCode={} type={} status={}",
                                roleCode, pageCode, permType, res.getStatusCode());
                    })
                    .body(JsonNode.class);

            if (root == null) {
                return false;
            }
            JsonNode dataNode = root.path("data");
            if (dataNode.isMissingNode() || dataNode.isNull()) {
                return false;
            }
            JsonNode allowedNode = dataNode.path("allowed");
            if (allowedNode.isMissingNode()) {
                return false;
            }
            return allowedNode.asBoolean(false);
        } catch (RestClientException ex) {
            log.warn("[SP-D4] auth-service 권한 조회 실패 (fallback=false) — roleCode={} pageCode={} error={}",
                    roleCode, pageCode, ex.getMessage());
            return false;
        } catch (Exception ex) {
            log.error("[SP-D4] 동적 권한 조회 예외 (fallback=false) — roleCode={} pageCode={} error={}",
                    roleCode, pageCode, ex.getMessage(), ex);
            return false;
        }
    }
}
