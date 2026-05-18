package com.samhanair.logis.accounting.client;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * 동적 RBAC 권한 조회 클라이언트 구현체 — SP-D1 POC.
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
     * <p>auth-service {@code GET /auth/admin/permissions/check?roleCode=&pageCode=&type=EDIT} 단일 호출.
     * 응답 {@code ApiResponse.data.allowed} 필드를 파싱하여 반환.
     *
     * <p>SP-D1 cycle 2 fix: canEdit + canView 2회 별도 호출에서 단일 EDIT 호출로 통합.
     * override row 존재 여부는 {@link #isOverrideActive(String, String)} 로 별도 확인 가능.
     */
    @Override
    public boolean canEdit(String roleCode, String pageCode) {
        return checkPermission(roleCode, pageCode, "EDIT");
    }

    /**
     * {@inheritDoc}
     *
     * <p>auth-service {@code GET /auth/admin/permissions/check?roleCode=&pageCode=&type=VIEW} 호출.
     * 응답 {@code ApiResponse.data.allowed} 필드를 파싱하여 반환.
     */
    @Override
    public boolean canView(String roleCode, String pageCode) {
        return checkPermission(roleCode, pageCode, "VIEW");
    }

    /**
     * override row 활성 여부 — VIEW 또는 EDIT 중 하나라도 true 이면 override 존재로 판단.
     *
     * <p>SP-D1 POC 에서 TaxInvoiceEmitService 가 override row 존재 여부를 판단할 때 사용.
     * 단일 EDIT 호출로 단순화하여 2회 개별 HTTP 호출의 원자성 문제를 회피한다.
     *
     * @param roleCode 역할 코드
     * @param pageCode 페이지 코드
     * @return VIEW 또는 EDIT 권한이 존재하면 {@code true}
     */
    public boolean isOverrideActive(String roleCode, String pageCode) {
        return checkPermission(roleCode, pageCode, "VIEW")
                || checkPermission(roleCode, pageCode, "EDIT");
    }

    /**
     * auth-service {@code /auth/admin/permissions/check} 를 호출하여 권한 여부 반환.
     *
     * <p>응답은 {@code ApiResponse<{allowed: boolean}>} 래퍼이므로
     * {@code JsonNode} 로 역직렬화 후 {@code data.allowed} 를 추출한다.
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
                        // 4xx (404 override 없음, 403 권한 없음) → false 반환 (예외 미발생)
                        log.debug("[SP-D1] 권한 조회 4xx — roleCode={} pageCode={} type={} status={}",
                                roleCode, pageCode, permType, res.getStatusCode());
                    })
                    .body(JsonNode.class);

            if (root == null) {
                return false;
            }
            // ApiResponse 래퍼: { success, code, message, data: { allowed: boolean }, timestamp }
            JsonNode dataNode = root.path("data");
            if (dataNode.isMissingNode() || dataNode.isNull()) {
                log.debug("[SP-D1] 권한 조회 응답 data 필드 누락 — roleCode={} pageCode={} type={}",
                        roleCode, pageCode, permType);
                return false;
            }
            JsonNode allowedNode = dataNode.path("allowed");
            if (allowedNode.isMissingNode()) {
                log.debug("[SP-D1] 권한 조회 응답 data.allowed 필드 누락 — roleCode={} pageCode={} type={}",
                        roleCode, pageCode, permType);
                return false;
            }
            return allowedNode.asBoolean(false);
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
}
