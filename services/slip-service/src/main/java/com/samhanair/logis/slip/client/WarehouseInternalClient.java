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

/** inventory-service에서 전표의 창고명을 조회하며 장애를 빈 결과로 축약하지 않는 client. */
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
     * 창고 UUID로 창고명을 조회한다.
     *
     * @param warehouseId 창고 UUID
     * @return 조회된 창고명
     * @throws IllegalStateException inventory 조회 실패·응답 계약 불일치
     */
    public Optional<String> findWarehouseName(UUID warehouseId) {
        if (warehouseId == null) {
            throw new IllegalStateException("창고 조회 실패: sourceWarehouseId가 없습니다");
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("WarehouseInternalClient — X-Internal-Token 미설정, UUID 창고 조회 건너뜀");
            throw new IllegalStateException("창고 조회 실패: internal token이 없습니다");
        }
        try {
            String body = restClient.get()
                    .uri("/internal/inventory/warehouses/{warehouseId}", warehouseId)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseName(body);
        } catch (RestClientResponseException ex) {
            log.debug("WarehouseInternalClient — 창고명 조회 status={}", ex.getStatusCode().value());
            throw new IllegalStateException("창고 조회 실패: HTTP " + ex.getStatusCode().value(), ex);
        } catch (Exception ex) {
            log.warn("WarehouseInternalClient 창고명 조회 실패");
            if (ex instanceof IllegalStateException illegalStateException) throw illegalStateException;
            throw new IllegalStateException("창고 조회 실패", ex);
        }
    }

    private Optional<String> parseName(String body) {
        if (body == null || body.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || data.isNull()) {
                throw new IllegalStateException("창고 조회 실패: data가 없습니다");
            }
            for (String key : new String[]{"name", "warehouseName", "warehouse_name"}) {
                JsonNode node = data.get(key);
                if (node != null && !node.isNull() && !node.asText().isBlank()) {
                    return Optional.of(node.asText().trim());
                }
            }
            throw new IllegalStateException("창고 조회 실패: name이 없습니다");
        } catch (Exception ex) {
            log.warn("WarehouseInternalClient UUID 창고 응답 파싱 실패");
            if (ex instanceof IllegalStateException illegalStateException) throw illegalStateException;
            throw new IllegalStateException("창고 조회 실패: 응답 파싱 오류", ex);
        }
    }
}
