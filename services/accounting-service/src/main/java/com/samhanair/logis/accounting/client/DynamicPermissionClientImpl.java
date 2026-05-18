package com.samhanair.logis.accounting.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * 동적 RBAC 권한 조회 클라이언트 구현체 — SP-D1 POC.
 *
 * <p>auth-service 의 {@code /auth/admin/permissions} endpoint 를 호출하여
 * 특정 역할의 특정 페이지 접근 가능 여부를 확인한다.
 *
 * <p>장애 격리 정책:
 * <ul>
 *   <li>auth-service 다운 또는 네트워크 오류 → {@code false} 반환 (보수적 fallback)</li>
 *   <li>404 (override row 미존재) → {@code false} 반환 (fallback 정책 적용)</li>
 *   <li>403 (마스터 권한 없음) → {@code false} 반환</li>
 * </ul>
 *
 * <p>IT 에서 {@code @MockBean} 으로 격리 필요 (메모리 가드 {@code feedback_it_mockbean_external_clients.md}).
 */
@Component
public class DynamicPermissionClientImpl implements DynamicPermissionClient {

    private static final Logger log = LoggerFactory.getLogger(DynamicPermissionClientImpl.class);
    private static final String AUTH_SERVICE_BASE = "http://auth-service";

    private final RestClient restClient;

    public DynamicPermissionClientImpl(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder) {
        this.restClient = builder.baseUrl(AUTH_SERVICE_BASE).build();
    }

    /**
     * {@inheritDoc}
     *
     * <p>auth-service {@code GET /auth/admin/permissions/check?roleCode=&pageCode=&type=EDIT} 호출.
     * 응답 {@code data.canEdit} 필드를 반환.
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

    private boolean checkPermission(String roleCode, String pageCode, String permType) {
        try {
            PermissionCheckResponse response = restClient.get()
                    .uri("/auth/admin/permissions/check?roleCode={role}&pageCode={page}&type={type}",
                            roleCode, pageCode, permType)
                    .retrieve()
                    .onStatus(status -> status.is4xxClientError(), (req, res) -> {
                        // 4xx (404 override 없음, 403 권한 없음) → false 반환 (예외 미발생)
                        log.debug("[SP-D1] 권한 조회 4xx — roleCode={} pageCode={} type={} status={}",
                                roleCode, pageCode, permType, res.getStatusCode());
                    })
                    .body(PermissionCheckResponse.class);

            if (response == null) {
                return false;
            }
            return response.allowed();
        } catch (RestClientException ex) {
            log.warn("[SP-D1] auth-service 권한 조회 실패 (fallback=false) — roleCode={} pageCode={} error={}",
                    roleCode, pageCode, ex.getMessage());
            return false;
        } catch (Exception ex) {
            log.error("[SP-D1] 동적 권한 조회 예외 (fallback=false) — roleCode={} pageCode={} error={}",
                    roleCode, pageCode, ex.getMessage(), ex);
            return false;
        }
    }

    /**
     * auth-service 권한 조회 응답 내부 DTO.
     *
     * @param allowed 해당 permType 권한 부여 여부
     */
    private record PermissionCheckResponse(boolean allowed) {
    }
}
