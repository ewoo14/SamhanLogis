package com.samhanair.logis.partnerorder.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.config.InternalAuthProperties;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * M1a product-service (8084) RPC client — confirm 시 productId 카탈로그 검증 + 라인 스냅샷
 * (modelName/productName/categoryKey) 획득용.
 *
 * <p>{@code POST /products/internal/lookup} 호출 (inventory-service 의 동일 패턴).
 *
 * <p>회로 차단기 인스턴스: {@code productClient}.
 */
@Component
public class ProductClient {

    private static final Logger log = LoggerFactory.getLogger(ProductClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String PRODUCT_SERVICE_BASE = "http://product-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    public ProductClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                         InternalAuthProperties internalAuthProperties) {
        this.restClient = builder.baseUrl(PRODUCT_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
    }

    /**
     * productId 리스트의 카탈로그 정보를 일괄 조회.
     *
     * @param productIds 1~100건
     * @return ProductSummary 리스트 (입력 순서와 무관)
     * @throws BusinessException(INVALID_INPUT) 4xx 또는 입력 오류
     * @throws BusinessException(INTERNAL_ERROR) 5xx, 연결 실패
     */
    public List<ProductSummary> lookup(List<UUID> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "productIds 비어있음");
        }
        if (productIds.size() > 100) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "한 번에 최대 100건");
        }

        Map<String, Object> body = Map.of(
                "ids", productIds.stream().map(UUID::toString).toList());

        try {
            Map<String, Object> envelope = restClient.post()
                    .uri("/products/internal/lookup")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "product-service 4xx: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "product-service 5xx: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<>() {});

            Object data = envelope == null ? null : envelope.get("data");
            if (!(data instanceof List<?> rawList)) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "product-service 응답 포맷 오류 (data 누락)");
            }
            return rawList.stream()
                    .map(item -> {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> m = (Map<String, Object>) item;
                        return new ProductSummary(
                                UUID.fromString((String) m.get("id")),
                                (String) m.get("name"),
                                (String) m.get("modelName"),
                                m.get("categoryId") == null
                                        ? null
                                        : UUID.fromString((String) m.get("categoryId")),
                                m.get("sellingPrice") == null
                                        ? null
                                        : new java.math.BigDecimal(m.get("sellingPrice").toString()),
                                (String) m.get("status"));
                    })
                    .toList();
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("ProductClient lookup failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "product-service 호출 실패", ex);
        }
    }

    private String requireToken() {
        String token = internalAuthProperties.getInternalToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "samhan.internal-token 미설정");
        }
        return token;
    }
}
