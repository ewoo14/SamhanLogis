package com.samhanair.logis.accounting.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
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
 * Internal-token 인증 client to {@code product-service} 의
 * {@code POST /products/internal/lookup} batch endpoint (PR-E2 BE-A12 의존).
 *
 * <p>일별 세금계산서 마감 detail 에서 모델/할인/세트 마스터 lookup 시 호출.
 * inventory-service 의 동일 client 를 답습 (Layer 4 외부 client).
 *
 * <p>HTTP 매핑 ({@link #lookup(List)} 전용 — 요청/응답 size 가 반드시 일치해야 하는
 * 완전 성공 계약):
 * <ul>
 *   <li>4xx → BusinessException(INVALID_INPUT)</li>
 *   <li>5xx / connection → BusinessException(INTERNAL_ERROR)</li>
 *   <li>응답 일부 누락 (size &lt; req) → BusinessException(NOT_FOUND)</li>
 * </ul>
 *
 * <p>{@link #applicablePrices(List, LocalDate)}/{@link #fixedDiscountRates(List)} 등 #773 S2a
 * referent bulk 조회는 위 lookup 과 달리 <b>부분 성공(partial success)</b> 계약이다 — product-service
 * 가 결측/단종(soft-delete) productId 를 응답 Map 에서 생략하는 것이 정상이며, 응답 size 가 요청
 * {@code productIds} 보다 작아도 NOT_FOUND 로 취급하지 않는다(결측 판정은 S2b 재검증 엔진 몫). 4xx/5xx/
 * connection 오류 매핑만 {@link #lookup(List)} 과 동일하게 INVALID_INPUT/INTERNAL_ERROR 를 따른다.
 *
 * <p>본 client 는 IT 에서 {@code @MockBean} 격리 의무 (memory feedback_it_mockbean_external_clients).
 */
@Component
public class ProductClient {

    private static final Logger log = LoggerFactory.getLogger(ProductClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String PRODUCT_SERVICE_BASE = "http://product-service";
    /** product-service /lookup 1회 요청 최대 productId 수. */
    public static final int LOOKUP_BATCH_MAX = 100;
    /** referent bulk(applicable/fixed-discount) 1회 요청 최대 productId 수. 호출측 청킹도 이 값을 공유. */
    public static final int REFERENT_BATCH_MAX = 500;
    /**
     * 회계 라벨 벌크 조회(lookup-by-label-bulk) 1회 요청 최대 라벨 수 — product-service
     * {@code ProductService.LOOKUP_MAX}(100) 와 동일. 호출측(MonthEndCloseService) 청킹도 이 값을 공유한다.
     */
    public static final int LABEL_BATCH_MAX = 100;

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

    /**
     * product-service batch lookup. 1~100건 productId 리스트 검증 + 메타 반환.
     *
     * @param productIds 조회 대상 UUID 리스트
     * @return ProductSummary 리스트 (요청과 같은 size 보장 — 누락 시 NOT_FOUND)
     * @throws BusinessException(INVALID_INPUT) 입력 비어있거나 4xx 또는 batch 한도 초과
     * @throws BusinessException(NOT_FOUND) 응답 size &lt; 요청 size
     * @throws BusinessException(INTERNAL_ERROR) product-service 5xx / 네트워크 / envelope 오류
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
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "존재하지 않는 제품 ID");
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

    /** 제품 snapshot의 정확한 모델명으로 제품을 해소한다. */
    @SuppressWarnings("unchecked")
    public ProductSummary lookupByModel(String modelName) {
        if (modelName == null || modelName.isBlank()) {
            return null;
        }
        try {
            Map<String, Object> envelope = restClient.post()
                    .uri("/products/internal/lookup-by-model")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("modelName", modelName.trim()))
                    .retrieve()
                    .onStatus(status -> status.value() == 404, (req, res) -> {
                        throw new ModelNotFoundException();
                    })
                    .onStatus(HttpStatusCode::isError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "product-service 모델명 조회 실패: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<>() {});
            Object data = envelope == null ? null : envelope.get("data");
            return data == null ? null : objectMapper.convertValue(data, ProductSummary.class);
        } catch (ModelNotFoundException ex) {
            return null;
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 모델명 조회 실패", ex);
        }
    }

    /** 레거시 일마감 세트 매칭용 구성품 카탈로그를 조회한다. */
    @SuppressWarnings("unchecked")
    public List<EstimateComponent> estimateComponents(String category) {
        try {
            Map<String, Object> envelope = restClient.get()
                    .uri(uriBuilder -> uriBuilder.path("/products/internal/estimate-catalog/components")
                            .queryParam("category", category).build())
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "product-service 구성품 카탈로그 조회 실패: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<>() {});
            Object data = envelope == null ? null : envelope.get("data");
            if (!(data instanceof List<?> rawList)) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "product-service 구성품 카탈로그 응답 포맷 오류");
            }
            return ((List<Object>) rawList).stream()
                    .map(item -> objectMapper.convertValue(item, EstimateComponent.class))
                    .toList();
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 구성품 카탈로그 조회 실패", ex);
        }
    }

    private static final class ModelNotFoundException extends RuntimeException {}

    /**
     * product-service 에 저장된 카테고리별 "인상 전 단가" 기본값을 조회한다.
     *
     * <p>기존 {@code GET /products/internal/price-change-default-variant} 계약을 소비한다.
     * 응답이 누락되거나 Boolean 이 아닌 값이면 표시 단가를 임의로 선택하지 않도록 오류로 처리한다.
     *
     * @return product-service categoryKey 별 defaultPreChange
     */
    public Map<String, Boolean> priceChangeDefaultVariants() {
        Map<String, Object> envelope;
        try {
            envelope = restClient.get()
                    .uri("/products/internal/price-change-default-variant")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "product-service 단가변동 설정 조회 요청 오류: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "product-service 단가변동 설정 조회 실패: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<>() {});
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("ProductClient price-change default variant lookup failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 단가변동 설정 조회 실패", ex);
        }

        Object data = envelope == null ? null : envelope.get("data");
        if (!(data instanceof Map<?, ?> rawMap)) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 단가변동 설정 응답 포맷 오류 (data 누락)");
        }
        Map<String, Boolean> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
            if (!(entry.getKey() instanceof String key) || !(entry.getValue() instanceof Boolean value)) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "product-service 단가변동 설정 응답 포맷 오류 (categoryKey/defaultPreChange)");
            }
            result.put(key, value);
        }
        return result;
    }

    /**
     * 회계 라벨을 product-service internal endpoint 로 해소한다.
     *
     * <p>#773 후속 벌크 전환 이후 프로덕션 미호출 경로이며, 단건/벌크 parity 앵커,
     * 운영 디버깅, 향후 단건 internal 소비 대비용으로 유지한다.
     *
     * <p>일마감 재검증은 미매칭/중복매칭 자체도 리포트 대상이므로 404/409 는 예외 대신
     * {@link ProductLabelMatch.Status#NOT_FOUND}/{@link ProductLabelMatch.Status#AMBIGUOUS} 로
     * 사유를 보존해 반환한다. 그 외 4xx/5xx 및 네트워크 오류는 기존 lookup 과 동일하게
     * BusinessException 으로 전파한다.
     *
     * <p>반환값은 항상 non-null 이며 매칭 여부는 {@link ProductLabelMatch#status()} 로 판정한다.
     * {@code modelCode} 는 레거시 제품(모델코드 미부여) 매칭 시 null 일 수 있어 포맷 오류 판정
     * 대상이 아니다 — {@code productId} 누락만 진짜 응답 포맷 오류로 취급한다.
     *
     * @param label 품목명[규격] 회계 라벨
     * @return 사유 보존 매칭 result (MATCHED/NOT_FOUND/AMBIGUOUS, 항상 non-null)
     */
    @SuppressWarnings("unchecked")
    public ProductLabelMatch resolveByLabel(String label) {
        Map<String, Object> body = Map.of("label", label == null ? "" : label);

        Map<String, Object> envelope;
        try {
            envelope = restClient.post()
                    .uri("/products/internal/lookup-by-label")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(status -> status.value() == 404 || status.value() == 409, (req, res) -> {
                        throw new LabelNotResolvedException(res.getStatusCode().value());
                    })
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "라벨 제품 조회 요청 오류: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "product-service 호출 실패: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<>() {});
        } catch (LabelNotResolvedException ex) {
            log.info("ProductClient label lookup unmatched status={} label={}", ex.status, label);
            return ex.status == 404 ? ProductLabelMatch.notFound() : ProductLabelMatch.ambiguous();
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("ProductClient resolveByLabel failed: {}", ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 호출 실패", ex);
        }

        Object data = envelope == null ? null : envelope.get("data");
        if (!(data instanceof Map<?, ?> rawMap)) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 응답 포맷 오류 (data 누락)");
        }
        ProductLabelResponse response = objectMapper.convertValue(rawMap, ProductLabelResponse.class);
        if (response.id() == null) {
            // modelCode 는 레거시 제품(모델코드 미부여) 매칭 시 null 이 정상이므로 검증 대상에서 제외한다.
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 응답 포맷 오류 (productId 누락)");
        }
        return ProductLabelMatch.matched(response.id(), response.modelCode());
    }

    /**
     * 회계 라벨 목록을 product-service internal 벌크 endpoint 로 한 번에 해소한다 (#773 후속 —
     * {@link #resolveByLabel(String)} 순차 호출(N+1 HTTP)을 제거하기 위한 배치 client).
     *
     * <p>{@link #resolveByLabel(String)} 단건과 동일한 사유 보존(MATCHED/NOT_FOUND/AMBIGUOUS) 계약을
     * 라벨별로 유지하되, product-service 가 한 응답에 라벨별 status 를 담아 반환하므로 라벨별 404/409
     * 는 더 이상 개별 예외가 아니라 응답 body 의 {@code status} 문자열로 판정한다. 요청 자체의 4xx/5xx/
     * 네트워크 오류 매핑은 {@link #applicablePrices(List, LocalDate)} 등이 사용하는
     * {@link #postBulkReferent(String, Map, String)} 관례(INVALID_INPUT/INTERNAL_ERROR)를 그대로 따른다.
     *
     * <p>product-service 는 요청 labels 전부를 응답 Map 키로 포함하는 완전 응답 계약이다. 누락 키가
     * 있으면 client 단계에서 {@link ErrorCode#INTERNAL_ERROR} 로 차단한다.
     *
     * @param labels 조회할 라벨 목록. 빈 목록(또는 null)은 외부 호출 없이 빈 Map 반환. 1회 호출당 최대
     *               {@link #LABEL_BATCH_MAX}건 — 초과분은 호출측이 청킹해서 여러 번 호출해야 한다
     * @return 라벨 → 매칭 result. 항상 non-null result 값(MATCHED/NOT_FOUND/AMBIGUOUS)
     * @throws BusinessException(INVALID_INPUT) batch 한도 초과, product-service 4xx
     * @throws BusinessException(INTERNAL_ERROR) product-service 5xx / 네트워크 / envelope 오류 /
     *                                            라벨별 응답 포맷 오류(알 수 없는 status, MATCHED인데 productId 누락),
     *                                            요청 라벨 응답 키 누락
     */
    public Map<String, ProductLabelMatch> resolveByLabelBulk(List<String> labels) {
        if (labels == null || labels.isEmpty()) {
            return Map.of();
        }
        if (labels.size() > LABEL_BATCH_MAX) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "한 번에 조회할 수 있는 최대 라벨 수는 " + LABEL_BATCH_MAX + "건입니다");
        }
        Map<String, Object> body = Map.of("labels", labels);

        Map<String, Object> envelope = postBulkReferent(
                "/products/internal/lookup-by-label-bulk",
                body,
                "ProductClient resolveByLabelBulk failed");

        Object data = envelope == null ? null : envelope.get("data");
        if (!(data instanceof Map<?, ?> rawMap)) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 응답 포맷 오류 (data 누락)");
        }
        Map<String, ProductLabelMatch> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
            LabelResolutionResponse response =
                    objectMapper.convertValue(entry.getValue(), LabelResolutionResponse.class);
            result.put(String.valueOf(entry.getKey()), toProductLabelMatch(response));
        }
        for (String label : new LinkedHashSet<>(labels)) {
            if (!result.containsKey(label)) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "product-service 벌크 응답 라벨 누락: " + label);
            }
        }
        return result;
    }

    /**
     * product-service 벌크 응답의 라벨별 status 문자열을 {@link ProductLabelMatch} 로 변환한다.
     *
     * <p>MSA 경계상 product-service DTO(enum) 타입을 import 하지 않고, accounting 자체
     * {@link ProductLabelMatch.Status} enum 이름과 문자열로 정합시켜 비교한다 — product-service 의
     * {@code LabelResolutionResult.status} 는 이 이름들과 문자열 계약으로 느슨 결합되어 있다.
     * {@code productId}/{@code modelCode} 는 status=MATCHED 일 때만 읽는다 — {@link #resolveByLabel(String)}
     * 와 동일하게 modelCode null 은 레거시 제품 정상 상태이므로 검증 대상에서 제외한다.
     */
    private static ProductLabelMatch toProductLabelMatch(LabelResolutionResponse response) {
        String status = response.status();
        if (ProductLabelMatch.Status.MATCHED.name().equals(status)) {
            if (response.productId() == null) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "product-service 응답 포맷 오류 (MATCHED인데 productId 누락)");
            }
            return ProductLabelMatch.matched(response.productId(), response.modelCode());
        }
        if (ProductLabelMatch.Status.AMBIGUOUS.name().equals(status)) {
            return ProductLabelMatch.ambiguous();
        }
        if (ProductLabelMatch.Status.NOT_FOUND.name().equals(status)) {
            return ProductLabelMatch.notFound();
        }
        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                "product-service 응답 포맷 오류 (알 수 없는 라벨 status: " + status + ")");
    }

    /**
     * product-service S1a 시점별 적용 정가를 벌크 조회한다.
     *
     * <p>{@code asOf} 는 업무일 기준 시점이며, product-service 는 {@code effectiveDate <= asOf}
     * 중 최신 price_history row 를 반환한다. product-service 는 적용 가능한 시점별 정가가 없는
     * productId 를 응답 Map 에서 생략하는 부분 성공(partial success) 계약이므로, 반환 Map 의
     * size 는 요청 {@code productIds} 보다 작을 수 있다. 결측 productId 판정/리포트는 S2b
     * 재검증 엔진에서 처리한다.
     *
     * @param productIds 조회 대상 productId 목록. 빈 목록은 외부 호출 없이 빈 Map 반환.
     *                   원소에 null 이 있으면 안 된다
     * @param asOf 적용 정가 기준 업무일
     * @return productId 별 적용 정가/납품가/기준일. 적용 정가가 없는 productId 는 생략될 수 있다
     * @throws BusinessException(INVALID_INPUT) asOf 누락, batch 한도 초과, productId 원소 null,
     *                                           product-service 4xx
     * @throws BusinessException(INTERNAL_ERROR) product-service 5xx / 네트워크 / envelope 오류
     */
    @SuppressWarnings("unchecked")
    public Map<UUID, ApplicablePrice> applicablePrices(List<UUID> productIds, LocalDate asOf) {
        if (productIds == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회할 제품 ID가 null 입니다");
        }
        if (productIds.isEmpty()) {
            return Map.of();
        }
        if (productIds.size() > REFERENT_BATCH_MAX) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "한 번에 조회할 수 있는 최대 제품 수는 " + REFERENT_BATCH_MAX + "건입니다");
        }
        if (asOf == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "시점별 정가 기준일이 비어있습니다");
        }
        Map<String, Object> body = Map.of(
                "productIds", productIds.stream().map(this::requireProductIdToString).toList(),
                "asOf", asOf.toString());

        Map<String, Object> envelope = postBulkReferent(
                "/products/internal/price-history/applicable-bulk",
                body,
                "ProductClient applicablePrices failed");

        Object data = envelope == null ? null : envelope.get("data");
        if (!(data instanceof Map<?, ?> rawMap)) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 응답 포맷 오류 (data 누락)");
        }
        Map<UUID, ApplicablePrice> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
            result.put(UUID.fromString(String.valueOf(entry.getKey())),
                    objectMapper.convertValue(entry.getValue(), ApplicablePrice.class));
        }
        return result;
    }

    /**
     * product-service S1c 고정DC율을 벌크 조회한다.
     *
     * <p>반환값은 percent 공간(예: {@code 45.00}) 그대로이며 재차 {@code * 100} 하지 않는다.
     * {@code fixedDiscountRate == null} 은 고정DC 미설정이라는 정상 상태이므로 반환 Map 의 value 에
     * null 이 보존될 수 있다. product-service 는 productId 자체가 존재하지 않는 건만 응답 Map 에서
     * 생략하는 부분 성공(partial success) 계약이므로, 반환 Map 의 size 는 요청 {@code productIds}
     * 보다 작을 수 있다. 결측 productId 판정/리포트는 S2b 재검증 엔진에서 처리한다.
     *
     * @param productIds 조회 대상 productId 목록. 빈 목록은 외부 호출 없이 빈 Map 반환.
     *                   원소에 null 이 있으면 안 된다
     * @return productId 별 고정DC율(percent). value null 허용, 존재하지 않는 productId 는 생략될 수 있다
     * @throws BusinessException(INVALID_INPUT) batch 한도 초과, productId 원소 null, product-service 4xx
     * @throws BusinessException(INTERNAL_ERROR) product-service 5xx / 네트워크 / envelope 오류
     */
    @SuppressWarnings("unchecked")
    public Map<UUID, BigDecimal> fixedDiscountRates(List<UUID> productIds) {
        if (productIds == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회할 제품 ID가 null 입니다");
        }
        if (productIds.isEmpty()) {
            return Map.of();
        }
        if (productIds.size() > REFERENT_BATCH_MAX) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "한 번에 조회할 수 있는 최대 제품 수는 " + REFERENT_BATCH_MAX + "건입니다");
        }
        Map<String, Object> body = Map.of(
                "productIds", productIds.stream().map(this::requireProductIdToString).toList());

        Map<String, Object> envelope = postBulkReferent(
                "/products/internal/fixed-discount-rate-bulk",
                body,
                "ProductClient fixedDiscountRates failed");

        Object data = envelope == null ? null : envelope.get("data");
        if (!(data instanceof Map<?, ?> rawMap)) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 응답 포맷 오류 (data 누락)");
        }
        Map<UUID, BigDecimal> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
            FixedDiscountResponse response =
                    objectMapper.convertValue(entry.getValue(), FixedDiscountResponse.class);
            result.put(UUID.fromString(String.valueOf(entry.getKey())), response.fixedDiscountRate());
        }
        return result;
    }

    private Map<String, Object> postBulkReferent(
            String uri,
            Map<String, Object> body,
            String logMessage) {
        try {
            return restClient.post()
                    .uri(uri)
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "product-service 조회 요청 오류: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "product-service 호출 실패: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<>() {});
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("{}: {}", logMessage, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "product-service 호출 실패", ex);
        }
    }

    /**
     * productId 원소가 null 이면 즉시 BusinessException(INVALID_INPUT) 으로 거부한다.
     * {@code applicablePrices}/{@code fixedDiscountRates} 의 벌크 요청 직렬화 직전 방어용.
     */
    private String requireProductIdToString(UUID productId) {
        if (productId == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "조회할 제품 ID 목록에 null 항목이 있습니다");
        }
        return productId.toString();
    }

    private String requireToken() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "app.security.internal.token 미설정");
        }
        return token;
    }

    private record ProductLabelResponse(UUID id, String modelCode) {
    }

    /**
     * product-service {@code lookup-by-label-bulk} 응답 Map 의 value 파싱 대상 —
     * product-service {@code LabelResolutionResult} 와 필드 계약(status/productId/modelCode)만 공유한다.
     */
    private record LabelResolutionResponse(String status, UUID productId, String modelCode) {
    }

    private record FixedDiscountResponse(BigDecimal fixedDiscountRate) {
    }

    private static class LabelNotResolvedException extends RuntimeException {
        private final int status;

        private LabelNotResolvedException(int status) {
            this.status = status;
        }
    }
}
