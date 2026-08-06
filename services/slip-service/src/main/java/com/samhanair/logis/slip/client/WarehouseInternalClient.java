package com.samhanair.logis.slip.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.Optional;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/** inventory-service에서 전표의 창고명을 조회하며 장애를 빈 결과로 축약하지 않는 client. */
@Component
public class WarehouseInternalClient {

    /** inventory가 창고를 확정적으로 찾지 못한 경우 — 재시도하지 않고 격리할 수 있다. */
    public static final class WarehouseNotFoundException extends IllegalStateException {
        public WarehouseNotFoundException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /** alias endpoint 자체를 사용할 수 없을 때의 일시 장애 신호. */
    public static final class WarehouseAliasUnavailableException extends IllegalStateException {
        public WarehouseAliasUnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }

    /** staging alias 응답의 내부 표현. UUID는 actuator/로그에 직접 노출하지 않는다. */
    public record EcountWarehouseAlias(String ecountCode, UUID warehouseId) {
    }

    private static final Logger log = LoggerFactory.getLogger(WarehouseInternalClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String INVENTORY_SERVICE_BASE = "http://inventory-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    @Autowired
    public WarehouseInternalClient(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
            InternalAuthProperties internalAuthProperties,
            ObjectMapper objectMapper) {
        this(buildInventoryRestClient(builder), internalAuthProperties, objectMapper);
    }

    /**
     * 테스트에서 MockRestServiceServer가 설치한 RestClient를 주입한다.
     *
     * <p>생산 경로는 {@link #buildInventoryRestClient(RestClient.Builder)}에서 연결·읽기
     * 타임아웃을 가진 요청 팩토리를 사용한다. 테스트용 RestClient는 mock 서버의 요청 팩토리를
     * 보존해야 하므로, 생성자가 이미 빌드된 client를 받도록 분리한다.
     */
    WarehouseInternalClient(
            RestClient restClient,
            InternalAuthProperties internalAuthProperties,
            ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    private static RestClient buildInventoryRestClient(RestClient.Builder builder) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        requestFactory.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
        return builder.baseUrl(INVENTORY_SERVICE_BASE)
                .requestFactory(requestFactory)
                .build();
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
            if (ex.getStatusCode().value() == 404) {
                return Optional.empty();
            }
            throw new IllegalStateException("창고 조회 실패: HTTP " + ex.getStatusCode().value(), ex);
        } catch (Exception ex) {
            log.warn("WarehouseInternalClient 창고명 조회 실패");
            if (ex instanceof IllegalStateException illegalStateException) throw illegalStateException;
            throw new IllegalStateException("창고 조회 실패", ex);
        }
    }

    /**
     * eCount 코드 alias를 inventory의 권위 staging 원본에서 일괄 조회한다.
     *
     * <p>기존 {@code /by-code} 역조회는 native warehouse code namespace를 조회하므로 이
     * 검증에 사용하지 않는다. HTTP 404를 alias 미실재로 해석하지 않고 endpoint/서비스 장애로
     * 분류하여, 호출자가 {@code NOT_FOUND}와 {@code UNAVAILABLE}을 구분할 수 있게 한다.
     *
     * @param ecountCodes 검증할 eCount 코드
     * @return 응답에 존재한 alias만 code keyed map으로 반환
     * @throws WarehouseAliasUnavailableException 외부 조회 timeout/오류/계약 오류
     */
    public Map<String, EcountWarehouseAlias> findEcountWarehouseAliases(
            Collection<String> ecountCodes) {
        if (ecountCodes == null || ecountCodes.isEmpty()) {
            return Map.of();
        }
        String codes = ecountCodes.stream()
                .map(String::trim)
                .filter(code -> !code.isBlank())
                .distinct()
                .reduce((left, right) -> left + "," + right)
                .orElseThrow(() -> new WarehouseAliasUnavailableException(
                        "eCount alias 조회 코드가 없습니다", null));
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new WarehouseAliasUnavailableException(
                    "eCount alias 조회 실패: internal token이 없습니다", null);
        }
        try {
            String body = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/internal/inventory/warehouses/by-ecount-codes")
                            .queryParam("codes", codes)
                            .build())
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseEcountAliases(body);
        } catch (RestClientResponseException ex) {
            throw new WarehouseAliasUnavailableException(
                    "eCount alias 조회 실패: HTTP " + ex.getStatusCode().value(), ex);
        } catch (WarehouseAliasUnavailableException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new WarehouseAliasUnavailableException("eCount alias 조회 실패", ex);
        }
    }

    /** UUID 원천으로 inventory가 보유한 업무 구분 code를 조회한다. */
    public Optional<String> findWarehouseCode(UUID warehouseId) {
        if (warehouseId == null) {
            throw new IllegalStateException("창고 조회 실패: sourceWarehouseId가 없습니다");
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new IllegalStateException("창고 조회 실패: internal token이 없습니다");
        }
        try {
            String body = restClient.get()
                    .uri("/internal/inventory/warehouses/{warehouseId}", warehouseId)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            if (body == null || body.isBlank()) return Optional.empty();
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            for (String key : new String[]{"code", "warehouseCode", "warehouse_code"}) {
                JsonNode node = data == null ? null : data.get(key);
                if (node != null && !node.isNull() && !node.asText().isBlank()) {
                    return Optional.of(node.asText().trim());
                }
            }
            return Optional.empty();
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() == 404) {
                throw new WarehouseNotFoundException("창고 조회 실패: HTTP 404", ex);
            }
            throw new IllegalStateException("창고 조회 실패: HTTP " + ex.getStatusCode().value(), ex);
        } catch (Exception ex) {
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

    private Map<String, EcountWarehouseAlias> parseEcountAliases(String body) {
        if (body == null || body.isBlank()) {
            throw new WarehouseAliasUnavailableException("eCount alias 응답이 비어 있습니다", null);
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || !data.isArray()) {
                throw new IllegalStateException("eCount alias 응답 data가 배열이 아닙니다");
            }
            Map<String, EcountWarehouseAlias> aliases = new LinkedHashMap<>();
            for (JsonNode item : data) {
                String code = text(item, "ecountCode", "ecount_code");
                String warehouseId = text(item, "warehouseId", "warehouse_uuid", "warehouseUuid");
                if (code == null || warehouseId == null) {
                    throw new IllegalStateException("eCount alias 응답 필드가 없습니다");
                }
                aliases.put(code.trim(), new EcountWarehouseAlias(
                        code.trim(), UUID.fromString(warehouseId.trim())));
            }
            return aliases;
        } catch (WarehouseAliasUnavailableException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new WarehouseAliasUnavailableException("eCount alias 응답 파싱 실패", ex);
        }
    }

    private static String text(JsonNode node, String... keys) {
        for (String key : keys) {
            JsonNode value = node.get(key);
            if (value != null && !value.isNull() && !value.asText().isBlank()) {
                return value.asText();
            }
        }
        return null;
    }
}
