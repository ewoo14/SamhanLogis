package com.samhanair.logis.partnerorder.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * product-service estimate-catalog internal client.
 *
 * <p>order-app bootstrap 이 더 이상 Google Sheets/V2 seed 빈 배열에 의존하지 않도록
 * product_db 의 견적품목 카탈로그를 legacy bootstrap shape 변환 전 원천으로 읽는다.
 */
@Component
public class EstimateCatalogClient {

    private static final Logger log = LoggerFactory.getLogger(EstimateCatalogClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String PRODUCT_SERVICE_BASE = "http://product-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    public EstimateCatalogClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                                 InternalAuthProperties internalAuthProperties) {
        this.restClient = builder.baseUrl(PRODUCT_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
    }

    public List<Map<String, Object>> catalog(EstimateCategory category, UsageScope scope) {
        return getList(uriBuilder -> uriBuilder
                .path("/products/internal/estimate-catalog/products")
                .queryParam("category", category.name())
                .queryParam("scope", scope.name())
                .build());
    }

    public List<Map<String, Object>> components(EstimateCategory category) {
        return getList(uriBuilder -> uriBuilder
                .path("/products/internal/estimate-catalog/components")
                .queryParam("category", category.name())
                .build());
    }

    public List<Map<String, Object>> materialPrices() {
        return getList(uriBuilder -> uriBuilder
                .path("/products/internal/estimate-catalog/material-prices")
                .build());
    }

    public List<Map<String, Object>> priceBaseline() {
        return getList(uriBuilder -> uriBuilder
                .path("/products/internal/estimate-catalog/price-baseline")
                .build());
    }

    public Map<String, LocalDate> priceChangeSchedule() {
        try {
            Map<String, Object> envelope = restClient.get()
                    .uri("/products/internal/price-change-schedule")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "product-service price-change-schedule 4xx: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "product-service price-change-schedule 5xx: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<>() {});

            Object data = envelope == null ? null : envelope.get("data");
            if (!(data instanceof Map<?, ?> rawMap)) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "product-service price-change-schedule 응답 포맷 오류 (data 누락)");
            }
            Map<String, LocalDate> out = new LinkedHashMap<>();
            rawMap.forEach((k, v) -> {
                if (k instanceof String key && v != null) {
                    out.put(key, LocalDate.parse(v.toString()));
                }
            });
            return out;
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("EstimateCatalogClient price-change-schedule request failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service price-change-schedule 호출 실패", ex);
        }
    }

    private List<Map<String, Object>> getList(java.util.function.Function<
            org.springframework.web.util.UriBuilder, java.net.URI> uriFunction) {
        try {
            Map<String, Object> envelope = restClient.get()
                    .uri(uriFunction)
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "product-service estimate-catalog 4xx: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "product-service estimate-catalog 5xx: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<>() {});

            Object data = envelope == null ? null : envelope.get("data");
            if (!(data instanceof List<?> rawList)) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "product-service estimate-catalog 응답 포맷 오류 (data 누락)");
            }
            return rawList.stream()
                    .map(this::toMap)
                    .toList();
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("EstimateCatalogClient request failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service estimate-catalog 호출 실패", ex);
        }
    }

    private Map<String, Object> toMap(Object item) {
        @SuppressWarnings("unchecked")
        Map<String, Object> map = (Map<String, Object>) item;
        return map;
    }

    private String requireToken() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "samhan.internal-token 미설정");
        }
        return token;
    }
}
