package com.samhanair.logis.partnerorder.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Autowired;
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

    @Autowired
    public ProductClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                         InternalAuthProperties internalAuthProperties) {
        this.restClient = builder.baseUrl(PRODUCT_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
    }

    ProductClient(RestClient.Builder builder, InternalAuthProperties internalAuthProperties,
                  String productServiceBaseUrl) {
        this.restClient = builder.baseUrl(productServiceBaseUrl).build();
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
                    .map(this::toProductSummary)
                    .toList();
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("ProductClient lookup failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "product-service 호출 실패", ex);
        }
    }

    /**
     * 품목별 고정DC율을 기존 product-service 부분성공 endpoint에서 조회한다.
     *
     * <p>구형 product-service가 lookup 요약에 아직 고정DC를 싣지 않는 동안에도 confirm이
     * bootstrap/product DB의 실제 percent 값을 사용할 수 있게 하는 보강 경로다. 유효한 응답에서
     * 고정DC가 없는 것은 빈 Map으로 표현하지만, 원격 장애는 가격 기준을 잃은 상태이므로 숨기지 않는다.
     *
     * @param productIds 조회할 품목 UUID
     * @return productId → fixedDiscountRate(percent), 유효한 응답의 결측은 빈 Map
     */
    public Map<UUID, BigDecimal> lookupFixedDiscountRates(List<UUID> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            return Map.of();
        }
        Map<String, Object> body = Map.of(
                "productIds", productIds.stream().map(UUID::toString).toList());
        try {
            Map<String, Object> envelope = restClient.post()
                    .uri("/products/internal/fixed-discount-rate-bulk")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(new ParameterizedTypeReference<>() {});

            Object data = envelope == null ? null : envelope.get("data");
            if (!(data instanceof Map<?, ?> rawMap)) {
                throw new BusinessException(ErrorCode.PRICE_CALCULATION_UNAVAILABLE,
                        "품목 고정 할인 기준을 확인할 수 없습니다");
            }
            Map<UUID, BigDecimal> result = new HashMap<>();
            for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                try {
                    UUID productId = OpaqueUuidDecoder.decode(String.valueOf(entry.getKey()));
                    if (!(entry.getValue() instanceof Map<?, ?> value)) {
                        continue;
                    }
                    Object rate = value.get("fixedDiscountRate");
                    if (rate != null) {
                        result.put(productId, new BigDecimal(rate.toString()));
                    }
                } catch (IllegalArgumentException ignored) {
                    // 부분 응답의 손상된 한 건은 나머지 품목을 가리지 않는다.
                }
            }
            return result;
        } catch (RuntimeException ex) {
            log.warn("ProductClient fixed discount lookup unavailable: {}", ex.getMessage());
            if (ex instanceof BusinessException businessException) {
                throw businessException;
            }
            throw new BusinessException(ErrorCode.PRICE_CALCULATION_UNAVAILABLE,
                    "품목 고정 할인 기준을 확인할 수 없어 주문 가격을 계산할 수 없습니다", ex);
        }
    }

    /**
     * modelCode 리스트의 카탈로그 정보를 일괄 조회.
     *
     * <p>주문 상세 productType enrich 는 productId 가 아니라 라인 modelCode snapshot 을 기준으로 수행한다.
     *
     * @param modelCodes 1~100건
     * @return ProductSummary 리스트 (입력 순서와 무관)
     */
    public List<ProductSummary> lookupByModelCodes(List<String> modelCodes) {
        if (modelCodes == null || modelCodes.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "modelCodes 비어있음");
        }
        if (modelCodes.size() > 100) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "한 번에 최대 100건");
        }

        Map<String, Object> body = Map.of("modelCodes", modelCodes);

        try {
            Map<String, Object> envelope = restClient.post()
                    .uri("/products/internal/lookup-by-model-codes")
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
                    .map(this::toProductSummary)
                    .toList();
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("ProductClient lookupByModelCodes failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "product-service 호출 실패", ex);
        }
    }

    /** 주문서웹 confirm 전용 품목분류 조회. */
    public List<ProductClassification> lookupClassificationsByModelCodes(List<String> modelCodes) {
        Map<String, Object> body = Map.of("modelCodes", modelCodes);
        try {
            Map<String, Object> envelope = restClient.post()
                    .uri("/products/internal/lookup-classifications-by-model-codes")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "품목분류 조회 실패: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<>() {});
            Object data = envelope == null ? null : envelope.get("data");
            if (!(data instanceof List<?> rawList)) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR, "품목분류 응답 포맷 오류");
            }
            return rawList.stream().map(item -> {
                @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) item;
                return new ProductClassification((String) m.get("modelCode"),
                        (String) m.get("productCategory"), (String) m.get("classificationL"),
                        (String) m.get("classificationM"),
                        Boolean.TRUE.equals(m.get("classificationAssigned")));
            }).toList();
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("ProductClient classification lookup failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "품목분류 조회 실패", ex);
        }
    }

    private ProductSummary toProductSummary(Object item) {
        @SuppressWarnings("unchecked")
        Map<String, Object> m = (Map<String, Object>) item;
        return new ProductSummary(
                OpaqueUuidDecoder.decode((String) m.get("id")),
                (String) m.get("name"),
                (String) m.get("modelName"),
                m.get("categoryId") == null
                        ? null
                        : OpaqueUuidDecoder.decode((String) m.get("categoryId")),
                m.get("sellingPrice") == null
                        ? null
                        : new java.math.BigDecimal(m.get("sellingPrice").toString()),
                (String) m.get("status"),
                (String) m.get("modelCode"),
                (String) m.get("productType"),
                (String) m.get("categoryKey"),
                m.get("fixedDiscountRate") == null
                        ? null
                        : new java.math.BigDecimal(m.get("fixedDiscountRate").toString()),
                (String) m.get("fixedDiscountSource"),
                (String) m.get("discountFlags"),
                m.get("releasePrice") == null
                        ? null
                        : new BigDecimal(m.get("releasePrice").toString()),
                m.get("deliveryPrice") == null
                        ? null
                        : new BigDecimal(m.get("deliveryPrice").toString()),
                m.get("hasVariableDiscount") == null
                        ? null
                        : Boolean.valueOf(m.get("hasVariableDiscount").toString()),
                  (String) m.get("physicalCategoryCode"),
                  (String) m.get("discountOption"),
                  Boolean.TRUE.equals(m.get("classificationAssigned")));
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
