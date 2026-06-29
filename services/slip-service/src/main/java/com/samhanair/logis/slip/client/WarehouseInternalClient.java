package com.samhanair.logis.slip.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * inventory-service 창고 마스터 내부 조회 client — SP-08-FU2 P2-2 신규.
 *
 * <p>입고전표 생성/수정 시점에 {@code destinationWarehouseId} (UUID) → 창고명 resolve 후
 * {@link com.samhanair.logis.slip.domain.Slip#snapshotDestinationWarehouseName} 으로 snapshot.
 *
 * <p>호출 endpoint: {@code GET /internal/inventory/warehouses/{warehouseId}} (inventory-service).
 *
 * <p>공개 {@code /inventory/warehouses/...} 는 gateway 사용자 신원 헤더가 필요한 화면용 계약이다.
 * 내부 서비스 간 창고명 resolve 는 {@code X-Internal-Token} 전용 internal endpoint 를 사용한다.
 *
 * <p>오류 처리 (fail-soft):
 * <ul>
 *   <li>4xx (404 = 미존재) → empty Optional + debug log</li>
 *   <li>5xx / 연결 실패 → empty Optional + warn log</li>
 *   <li>internal token 미설정 → empty Optional + warn log</li>
 * </ul>
 *
 * <p>IT 에서 {@code @MockBean} 격리 의무 (memory feedback_it_mockbean_external_clients).
 */
@Component
public class WarehouseInternalClient {

    private static final Logger log = LoggerFactory.getLogger(WarehouseInternalClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String INVENTORY_SERVICE_BASE = "http://inventory-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    public WarehouseInternalClient(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
            InternalAuthProperties internalAuthProperties,
            ObjectMapper objectMapper) {
        this.restClient = builder.baseUrl(INVENTORY_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * 창고 UUID 로 창고명 조회 (fail-soft).
     *
     * <p>inventory-service {@code GET /internal/inventory/warehouses/{warehouseId}} 호출.
     * 성공 시 창고명 문자열, 실패 시 empty.
     *
     * @param warehouseId 창고 UUID (필수)
     * @return 창고명 (성공) 또는 empty (실패 / 미존재)
     */
    public Optional<String> findWarehouseName(UUID warehouseId) {
        if (warehouseId == null) {
            return Optional.empty();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("WarehouseInternalClient — X-Internal-Token 미설정, lookup 건너뜀 (warehouseId={})",
                    warehouseId);
            return Optional.empty();
        }
        try {
            String body = restClient.get()
                    .uri("/internal/inventory/warehouses/{warehouseId}", warehouseId)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseName(body, warehouseId);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 404) {
                log.debug("WarehouseInternalClient — warehouseId={} 404 (창고 미존재)", warehouseId);
                return Optional.empty();
            }
            log.warn("WarehouseInternalClient — warehouseId={} status={} (비정상 응답)",
                    warehouseId, status);
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("WarehouseInternalClient 호출 실패 — warehouseId={}, msg={}",
                    warehouseId, ex.getMessage());
            return Optional.empty();
        }
    }

    /**
     * ApiResponse wrapper body 에서 창고명(name) 추출.
     *
     * @param body HTTP response body (JSON 문자열)
     * @param warehouseId 로그용 식별자
     * @return 창고명 또는 empty
     */
    private Optional<String> parseName(String body, UUID warehouseId) {
        if (body == null || body.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            // ApiResponse<T> wrapper 패턴: { "data": { "name": "..." } } 또는 평탄 객체
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || data.isNull()) {
                return Optional.empty();
            }
            // 창고명 필드 후보: name, warehouseName, warehouse_name
            for (String key : new String[]{"name", "warehouseName", "warehouse_name"}) {
                JsonNode node = data.get(key);
                if (node != null && !node.isNull() && !node.asText().isBlank()) {
                    return Optional.of(node.asText().trim());
                }
            }
            log.debug("WarehouseInternalClient — warehouseId={} 응답에 name 필드 없음", warehouseId);
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("WarehouseInternalClient response 파싱 실패 — warehouseId={}, msg={}",
                    warehouseId, ex.getMessage());
            return Optional.empty();
        }
    }
}
