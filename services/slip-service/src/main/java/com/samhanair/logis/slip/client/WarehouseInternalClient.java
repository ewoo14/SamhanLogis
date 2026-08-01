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
            log.warn("WarehouseInternalClient — X-Internal-Token 미설정, UUID 창고 조회 건너뜀");
            return Optional.empty();
        }
        try {
            String body = restClient.get()
                    .uri("/internal/inventory/warehouses/{warehouseId}", warehouseId)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseName(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 404) {
                log.debug("WarehouseInternalClient — UUID 창고 조회 404 (창고 미존재)");
                return Optional.empty();
            }
            log.warn("WarehouseInternalClient — UUID 창고 조회 status={} (비정상 응답)", status);
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("WarehouseInternalClient UUID 창고 조회 실패");
            return Optional.empty();
        }
    }

    /**
     * 창고 코드로 활성 창고의 식별 정보를 조회한다.
     *
     * @param warehouseCode 창고 코드
     * @return 조회된 창고 정보 또는 미존재/조회 실패 시 empty
     */
    public Optional<WarehouseSummary> findWarehouseByCode(String warehouseCode) {
        if (warehouseCode == null || warehouseCode.isBlank()) {
            return Optional.empty();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("WarehouseInternalClient — X-Internal-Token 미설정, 창고코드 조회를 수행할 수 없음");
            return Optional.empty();
        }
        try {
            String body = restClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/internal/inventory/warehouses/by-code")
                            .queryParam("code", warehouseCode.trim()).build())
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseWarehouseSummary(body);
        } catch (RestClientResponseException ex) {
            log.warn("WarehouseInternalClient — 창고코드 조회 status={} (코드={})",
                    ex.getStatusCode().value(), warehouseCode.trim());
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("WarehouseInternalClient 창고코드 조회 실패 — 코드={}", warehouseCode.trim());
            return Optional.empty();
        }
    }

    /**
     * 설정된 창고 UUID로 활성 창고 요약을 조회한다.
     *
     * <p>404(명백한 미실재)와 일시적인 조회 불가를 구분해 기동 검증 정책이 판단할 수 있게 한다.
     * UUID는 로그나 예외에 기록하지 않는다.
     *
     * @param warehouseId 설정된 창고 UUID
     * @return 조회 결과 상태와 창고 요약
     */
    public WarehouseLookup findWarehouseById(UUID warehouseId) {
        if (warehouseId == null) {
            return WarehouseLookup.unavailable();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("WarehouseInternalClient — X-Internal-Token 미설정, 창고 UUID 검증을 수행할 수 없음");
            return WarehouseLookup.unavailable();
        }
        try {
            String body = restClient.get()
                    .uri("/internal/inventory/warehouses/{warehouseId}", warehouseId)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseWarehouseSummary(body)
                    .map(WarehouseLookup::found)
                    .orElseGet(WarehouseLookup::unavailable);
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() == 404) {
                return WarehouseLookup.notFound();
            }
            log.warn("WarehouseInternalClient — 창고 UUID 검증 status={} (비정상 응답)",
                    ex.getStatusCode().value());
            return WarehouseLookup.unavailable();
        } catch (Exception ex) {
            log.warn("WarehouseInternalClient 창고 UUID 검증 일시 실패");
            return WarehouseLookup.unavailable();
        }
    }

    /**
     * ApiResponse wrapper body 에서 창고명(name) 추출.
     *
     * @param body HTTP response body (JSON 문자열)
     * @param warehouseId 로그용 식별자
     * @return 창고명 또는 empty
     */
    private Optional<String> parseName(String body) {
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
            log.debug("WarehouseInternalClient — UUID 창고 응답에 name 필드 없음");
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("WarehouseInternalClient UUID 창고 응답 파싱 실패");
            return Optional.empty();
        }
    }

    private Optional<WarehouseSummary> parseWarehouseSummary(String body) {
        if (body == null || body.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || data.isNull()
                    || !data.hasNonNull("warehouseId")
                    || !data.hasNonNull("code")) {
                return Optional.empty();
            }
            return Optional.of(new WarehouseSummary(
                    UUID.fromString(data.get("warehouseId").asText()),
                    data.get("code").asText()));
        } catch (Exception ex) {
            log.warn("WarehouseInternalClient 창고코드 응답 파싱 실패");
            return Optional.empty();
        }
    }

    /** 내부 창고 조회 응답 중 기동 검증에 필요한 필드만 보유한다. */
    public record WarehouseSummary(UUID warehouseId, String code) {
    }

    /** 창고 UUID 조회 결과의 기동 검증용 상태. */
    public record WarehouseLookup(LookupStatus status, WarehouseSummary summary) {

        public static WarehouseLookup found(WarehouseSummary summary) {
            return new WarehouseLookup(LookupStatus.FOUND, summary);
        }

        public static WarehouseLookup notFound() {
            return new WarehouseLookup(LookupStatus.NOT_FOUND, null);
        }

        public static WarehouseLookup unavailable() {
            return new WarehouseLookup(LookupStatus.UNAVAILABLE, null);
        }
    }

    /** 기동 검증에서 구분해야 하는 창고 조회 상태. */
    public enum LookupStatus {
        FOUND,
        NOT_FOUND,
        UNAVAILABLE
    }
}
