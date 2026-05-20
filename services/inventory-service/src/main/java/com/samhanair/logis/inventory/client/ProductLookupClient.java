package com.samhanair.logis.inventory.client;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * product-service 제품명 lookup client.
 *
 * <p>MIG-5 창고이동 importer 가 product-service 소유 DB/staging 을 직접 읽지 않도록
 * internal endpoint 로만 품목명을 해석한다.
 */
@Component
public class ProductLookupClient {

    private static final Logger log = LoggerFactory.getLogger(ProductLookupClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String PRODUCT_SERVICE_BASE = "http://product-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    public ProductLookupClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                               InternalAuthProperties internalAuthProperties,
                               ObjectMapper objectMapper) {
        this.restClient = builder.baseUrl(PRODUCT_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * 제품명 정확 매칭 fail-soft lookup.
     *
     * <p>404/401/5xx/network 는 empty 로 반환하고 importer 가
     * {@code MIG5_PRODUCT_LOOKUP_MISS} 로 reject 한다. 409 는 운영자에게 중복 매칭을
     * 분리해서 보여야 하므로 {@code MIG5_LOOKUP_AMBIGUOUS} 를 던진다.
     */
    public Optional<ProductSummary> findByProductNameStrict(String productName) {
        if (productName == null || productName.isBlank()) {
            return Optional.empty();
        }
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.error("ProductLookupClient — X-Internal-Token 미설정 (productName={})",
                    productName);
            throw new BusinessException(ErrorCode.MIG12_INTERNAL_AUTH_MISS,
                    "ProductLookupClient 내부 인증 토큰 미설정");
        }
        try {
            String body = restClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/products/internal/by-name")
                            .queryParam("name", productName.trim())
                            .build())
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .retrieve()
                    .body(String.class);
            return parseSummary(body);
        } catch (RestClientResponseException ex) {
            int status = ex.getStatusCode().value();
            if (status == 409) {
                throw new BusinessException(ErrorCode.MIG5_LOOKUP_AMBIGUOUS,
                        "품목명 lookup ambiguous: " + productName);
            }
            if (status == 401 || status == 403) {
                log.error("ProductLookupClient — productName={} status={} (내부 인증 실패)",
                        productName, status);
                throw new BusinessException(ErrorCode.MIG12_INTERNAL_AUTH_MISS,
                        "ProductLookupClient 내부 인증 실패: status=" + status);
            }
            if (status == 404) {
                log.debug("ProductLookupClient — productName={} status={} (lookup miss)",
                        productName, status);
                return Optional.empty();
            }
            log.warn("ProductLookupClient — productName={} status={} (예외)",
                    productName, status);
            return Optional.empty();
        } catch (Exception ex) {
            log.warn("ProductLookupClient 호출 실패 — productName={}, msg={}",
                    productName, ex.getMessage());
            return Optional.empty();
        }
    }

    private Optional<ProductSummary> parseSummary(String body) {
        if (body == null || body.isBlank()) {
            return Optional.empty();
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode data = root.has("data") ? root.get("data") : root;
            if (data == null || data.isNull() || !data.isObject()) {
                return Optional.empty();
            }
            return Optional.of(objectMapper.convertValue(data, ProductSummary.class));
        } catch (Exception ex) {
            log.warn("ProductLookupClient response 파싱 실패 — bodyLen={}, msg={}",
                    body.length(), ex.getMessage());
            return Optional.empty();
        }
    }
}
