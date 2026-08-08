package com.samhanair.logis.slip.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.http.client.SimpleClientHttpRequestFactory;

/**
 * Internal-token-authenticated client to {@code product-service}'s
 * {@code /products/internal/lookup} batch endpoint. slip-service 가 라인의 productId 를
 * 받을 때마다 이 클라이언트로 존재 여부를 검증한다.
 *
 * <p>404 → BusinessException(NOT_FOUND, "제품이 존재하지 않습니다")<br>
 * 401/403/408/429 등 조회 불가 4xx → BusinessException(INTERNAL_ERROR, "product-service 조회 검증 불가")<br>
 * 5xx / connection refused → BusinessException(INTERNAL_ERROR, "product-service 호출 실패")<br>
 * 1건이라도 응답에 없으면 BusinessException(NOT_FOUND).
 */
@Component
public class ProductClient {

    private static final Logger log = LoggerFactory.getLogger(ProductClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String PRODUCT_SERVICE_BASE = "http://product-service";
    private static final int LOOKUP_BATCH_MAX = 100;

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    public ProductClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                         InternalAuthProperties internalAuthProperties,
                         ObjectMapper objectMapper) {
        this.restClient = builder.baseUrl(PRODUCT_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /** 운영 DI 경로 — product-service 호출에 연결/읽기 시간 상한을 적용한다. */
    @org.springframework.beans.factory.annotation.Autowired
    public ProductClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                         InternalAuthProperties internalAuthProperties,
                         ObjectMapper objectMapper,
                         @Value("${samhan.product-client.connect-timeout-ms:2000}") int connectTimeoutMs,
                         @Value("${samhan.product-client.read-timeout-ms:3000}") int readTimeoutMs) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(connectTimeoutMs));
        requestFactory.setReadTimeout(Duration.ofMillis(readTimeoutMs));
        this.restClient = builder.requestFactory(requestFactory).baseUrl(PRODUCT_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * product-service 의 {@code POST /products/internal/lookup} 을 호출해 productId 리스트의
     * 존재 여부를 일괄 검증한다. X-Internal-Token 헤더로 인증.
     *
     * @param productIds 조회할 제품 UUID 리스트 (1 ~ {@value #LOOKUP_BATCH_MAX} 건)
     * @return 입력 순서와 무관한 ProductSummary 리스트
     * @throws BusinessException(INVALID_INPUT) productIds null/empty 또는 batch 한도 초과
     * @throws BusinessException(NOT_FOUND) product-service 가 404 반환
     * @throws BusinessException(INTERNAL_ERROR) product-service 가 조회 불가 4xx/5xx 반환,
     *         연결 실패, timeout, envelope 포맷 오류
     * @throws BusinessException(NOT_FOUND) 응답 항목 수 &lt; 요청 수
     * @throws BusinessException(INTERNAL_ERROR) product-service 5xx, 연결 실패, envelope 포맷 오류,
     *         혹은 internal token 미설정
     */
    @SuppressWarnings("unchecked")
    public List<ProductSummary> lookup(List<UUID> productIds) {
        if (productIds == null || productIds.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회할 제품 ID가 비어있습니다");
        }
        if (productIds.size() > LOOKUP_BATCH_MAX) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "한 번에 조회할 수 있는 최대 제품 수는 " + LOOKUP_BATCH_MAX + "건입니다");
        }

        Map<String, Object> body = Map.of(
                "ids", productIds.stream().map(UUID::toString).toList());

        Map<String, Object> envelope;
        try {
            envelope = restClient.post()
                    .uri("/products/internal/lookup")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        int status = res.getStatusCode().value();
                        if (status == 404) {
                            throw new BusinessException(ErrorCode.NOT_FOUND,
                                    "제품이 존재하지 않습니다");
                        }
                        log.warn("ProductClient.lookup — product-service 조회 검증 불가 — status={}", status);
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "product-service 조회를 검증할 수 없습니다: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "product-service 호출 실패: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<>() {});
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("ProductClient lookup failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 호출 실패", ex);
        }

        Object data = envelope == null ? null : envelope.get("data");
        if (!(data instanceof List<?> rawList)) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 응답 포맷 오류 (data 누락)");
        }
        List<ProductSummary> summaries = ((List<Object>) rawList).stream()
                .map(item -> objectMapper.convertValue(item, ProductSummary.class))
                .toList();

        if (summaries.size() < productIds.size()) {
            throw new BusinessException(ErrorCode.NOT_FOUND,
                    "일부 제품을 찾을 수 없습니다 (요청 " + productIds.size()
                            + ", 응답 " + summaries.size() + ")");
        }
        return summaries;
    }

    /**
     * 단건 검증 편의 — {@link #lookup(List)} 1건 호출 후 첫 항목 반환.
     *
     * @param productId 조회할 제품 UUID
     * @return product-service 의 ProductSummary
     */
    public ProductSummary requireExists(UUID productId) {
        return lookup(List.of(productId)).get(0);
    }

    /**
     * 모델코드 벌크 조회 — 전표 라인의 사용자 식별자인 modelCode를 product-service 정본과 연결한다.
     * 미매칭 모델코드는 부분 성공으로 반환되지 않으며 호출자는 라인 snapshot을 보존한다.
     *
     * @param modelCodes 조회할 모델코드 목록 (1 ~ 100건)
     * @return 매칭된 상품 요약 목록
     */
    @SuppressWarnings("unchecked")
    public List<ProductSummary> lookupByModelCodes(List<String> modelCodes) {
        if (modelCodes == null || modelCodes.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회할 모델코드가 비어있습니다");
        }
        if (modelCodes.size() > LOOKUP_BATCH_MAX) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "한 번에 조회할 수 있는 최대 모델코드 수는 " + LOOKUP_BATCH_MAX + "건입니다");
        }
        List<String> normalized = modelCodes.stream()
                .map(code -> code == null ? "" : code.trim())
                .filter(code -> !code.isEmpty())
                .distinct()
                .toList();
        if (normalized.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회할 모델코드가 비어있습니다");
        }

        Map<String, Object> envelope;
        try {
            envelope = restClient.post()
                    .uri("/products/internal/lookup-by-model-codes")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("modelCodes", normalized))
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT, "모델코드 조회 요청이 잘못되었습니다");
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "product-service 호출 실패: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<>() {});
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("ProductClient lookupByModelCodes failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "product-service 호출 실패", ex);
        }

        Object data = envelope == null ? null : envelope.get("data");
        if (!(data instanceof List<?> rawList)) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 응답 포맷 오류 (data 누락)");
        }
        return ((List<Object>) rawList).stream()
                .map(item -> objectMapper.convertValue(item, ProductSummary.class))
                .toList();
    }

    /**
     * 모델명 벌크 조회 — 전표 라인의 실제 입력값인 modelName으로 product-service를 조회한다.
     * modelCode 계보 조회와 분리하여 modelCode가 없는 이카운트 제품도 해소한다.
     *
     * @param modelNames 조회할 모델명 목록 (1 ~ 100건)
     * @return 매칭된 상품 요약 목록
     */
    @SuppressWarnings("unchecked")
    public List<ProductSummary> lookupByModelNames(List<String> modelNames) {
        if (modelNames == null || modelNames.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회할 모델명이 비어있습니다");
        }
        if (modelNames.size() > LOOKUP_BATCH_MAX) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "한 번에 조회할 수 있는 최대 모델명 수는 " + LOOKUP_BATCH_MAX + "건입니다");
        }
        List<String> normalized = modelNames.stream()
                .map(name -> name == null ? "" : name.trim())
                .filter(name -> !name.isEmpty())
                .distinct()
                .toList();
        if (normalized.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회할 모델명이 비어있습니다");
        }
        Map<String, Object> envelope;
        try {
            envelope = restClient.post()
                    .uri("/products/internal/lookup-by-model-names")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("modelNames", normalized))
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT, "모델명 조회 요청이 잘못되었습니다");
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "product-service 호출 실패: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<>() {});
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("ProductClient lookupByModelNames failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "product-service 호출 실패", ex);
        }
        Object data = envelope == null ? null : envelope.get("data");
        if (!(data instanceof List<?> rawList)) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 응답 포맷 오류 (data 누락)");
        }
        return ((List<Object>) rawList).stream()
                .map(item -> objectMapper.convertValue(item, ProductSummary.class))
                .toList();
    }

    /**
     * 모델명 단건 조회 — Slip 출력 슬라이스의 modelName onBlur lookup 흐름.
     * product-service 의 {@code POST /products/internal/lookup-by-model} 을 X-Internal-Token
     * 으로 호출.
     *
     * <p>HTTP 상태 매핑 (#854 R5 MED — 계열 sweep):
     * <ul>
     *   <li>404 → {@link BusinessException}({@link ErrorCode#NOT_FOUND}) "모델명에 해당하는 제품이 없습니다"</li>
     *   <li>404 외 4xx(401/403/408/429 포함) → {@link BusinessException}({@link ErrorCode#INTERNAL_ERROR}) —
     *       product-service 가 제품 존재 여부를 판정하지 못한 검증 불가 응답</li>
     *   <li>5xx / 네트워크 실패 → {@link BusinessException}({@link ErrorCode#INTERNAL_ERROR})</li>
     * </ul>
     *
     * @param modelName 정확 매칭할 제품 모델명 (null/blank 면 INVALID_INPUT)
     * @return product-service 의 ProductSummary 단건
     * @throws BusinessException(INVALID_INPUT) modelName null/blank
     * @throws BusinessException(NOT_FOUND) product-service 가 404
     * @throws BusinessException(INTERNAL_ERROR) 404 외 4xx(401/403/408/429 포함, 검증 불가) / 5xx / 네트워크 실패 / envelope 포맷 오류
     */
    public ProductSummary lookupByModel(String modelName) {
        if (modelName == null || modelName.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "모델명이 비어있습니다");
        }

        Map<String, Object> body = Map.of("modelName", modelName.trim());

        Map<String, Object> envelope;
        try {
            envelope = restClient.post()
                    .uri("/products/internal/lookup-by-model")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        int status = res.getStatusCode().value();
                        if (status == 404) {
                            throw new BusinessException(ErrorCode.NOT_FOUND,
                                    "모델명에 해당하는 제품이 없습니다");
                        }
                        log.warn("ProductClient.lookupByModel {} — 검증 불가로 처리 — modelName={}",
                                status, modelName);
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "product-service 모델명 조회를 검증할 수 없습니다: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "product-service 호출 실패: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<>() {});
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("ProductClient lookupByModel failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 호출 실패", ex);
        }

        Object data = envelope == null ? null : envelope.get("data");
        if (data == null) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 응답 포맷 오류 (data 누락)");
        }
        return objectMapper.convertValue(data, ProductSummary.class);
    }

    /**
     * 세트 전개 — product-service {@code POST /products/internal/expand} 호출. BUNDLE 부모면 옵션
     * 선별+6:4 재배분된 구성품 라인, KEEP/단일이면 1 라인 반환(첫 구성품 setHead=true).
     *
     * @param parentModelCode 부모 modelCode
     * @param setQty 세트 수량
     * @param options 옵션(패널/리모컨/자재), null 이면 기본
     * @param setUnitOverride 화면 단가(세트 재배분 base/단일 단가), null 이면 product 기본단가
     * @return 전개 결과 라인(영속용)
     */
    @SuppressWarnings("unchecked")
    public List<ExpandedLineDto> expand(String parentModelCode, java.math.BigDecimal setQty,
                                        ExpandedLineDto.Options options, java.math.BigDecimal setUnitOverride) {
        if (parentModelCode == null || parentModelCode.isBlank() || setQty == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "전개 대상 modelCode/수량이 비어있습니다");
        }
        java.util.Map<String, Object> body = new java.util.HashMap<>();
        body.put("parentModelCode", parentModelCode);
        body.put("setQty", setQty);
        if (setUnitOverride != null) {
            body.put("setUnitOverride", setUnitOverride);
        }
        if (options != null) {
            body.put("options", Map.of(
                    "remoteOption", options.remoteOption() == null ? "" : options.remoteOption(),
                    "remoteExcluded", options.remoteExcluded(),
                    "panelOption", options.panelOption() == null ? "" : options.panelOption(),
                    "panelShape360", options.panelShape360() == null ? "" : options.panelShape360(),
                    "materialIncluded", options.materialIncluded()));
        }

        Map<String, Object> envelope;
        try {
            envelope = restClient.post()
                    .uri("/products/internal/expand")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        if (res.getStatusCode().value() == 404) {
                            throw new BusinessException(ErrorCode.NOT_FOUND, "전개 대상 제품이 없습니다");
                        }
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "product-service 전개 실패: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "product-service 호출 실패: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<>() {});
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("ProductClient expand failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "product-service 호출 실패", ex);
        }

        Object data = envelope == null ? null : envelope.get("data");
        if (!(data instanceof List<?> rawList)) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "product-service 응답 포맷 오류 (data 누락)");
        }
        return ((List<Object>) rawList).stream()
                .map(item -> objectMapper.convertValue(item, ExpandedLineDto.class))
                .toList();
    }

    private String requireToken() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "app.security.internal.token 미설정");
        }
        return token;
    }
}
