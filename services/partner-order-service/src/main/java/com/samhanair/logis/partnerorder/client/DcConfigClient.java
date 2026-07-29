package com.samhanair.logis.partnerorder.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.samhanair.logis.common.dto.ApiResponse;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * dc-config-service (8089) RPC client — confirm 의 server-side DC 단가 계산.
 *
 * <p>{@code POST /internal/price-calculations} (X-Internal-Token) 로 라인별 정상가+카테고리+옵션을
 * 보내면 dc-config-service 가 DcConfig+DcRule 을 적용한 finalPrice 를 응답한다.
 *
 * <p><b>typed 역직렬화</b>: {@link PriceCalcResult} record 를 사용하여 {@code ApiResponse<PriceCalcResult>}
 * 로 직접 역직렬화한다. 기존 {@code Map<String,Object>} 경로에서 Double 경유 부동소수 위험을 제거하고
 * BigDecimal 정밀도를 보존한다.
 *
 * <p><b>fail-soft</b>: 404(DC 미설정)/5xx/연결실패 시 빈 Map 반환 → 호출자가 listPrice 그대로 사용
 * (회계 critical path 보호 + 기존 "DC 미적용 시 정상가" 사상 보존).
 *
 * <p><b>timeout</b>: connect 2s / read 3s — dc-config hang 시 confirm thread block 방지(fail-soft 보강).
 */
@Component
public class DcConfigClient {

    private static final Logger log = LoggerFactory.getLogger(DcConfigClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String DC_CONFIG_SERVICE_BASE = "http://dc-config-service";
    private static final String CALLER = "partner-order-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    public DcConfigClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                          InternalAuthProperties internalAuthProperties) {
        // N-1 공유 빌더 변이 방지: builder.clone() 으로 DcConfigClient 전용 사본 생성.
        // loadBalancedRestClientBuilder 는 @Scope 없는 싱글턴 @Bean 이므로
        // builder.requestFactory(rf) 를 직접 호출하면 같은 빌더를 주입받는
        // ProductClient / InventoryClient / SlipServiceClient 등에도
        // connect 2s / read 3s timeout 이 전파되는 잠재적 회귀가 발생한다.
        // clone() 은 DefaultRestClientBuilder(this) 로 완전히 독립된 빌더 사본을 반환하므로
        // 원본 싱글턴 빌더는 변이되지 않는다 (Spring 6.1.x RestClient.Builder#clone() 명시).
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        rf.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
        this.restClient = builder.clone()
                .baseUrl(DC_CONFIG_SERVICE_BASE)
                .requestFactory(rf)
                .build();
        this.internalAuthProperties = internalAuthProperties;
    }

    /** 가격 계산 요청 라인 — dc-config PriceCalculationRequest.Line 미러. */
    public record PriceLine(String lineId, String modelCode, BigDecimal listPrice,
                            String category, int quantity,
                            boolean is360, boolean is4Way, boolean is1Way,
                            boolean isStand, boolean isDeluxe, boolean isFirstGrade,
                            BigDecimal fixedDiscountRate) {

        /** 기존 호출자 호환 — 옵션/품목 고정DC가 없는 평범한 품목. */
        public PriceLine(String lineId, String modelCode, BigDecimal listPrice,
                         String category, int quantity) {
            this(lineId, modelCode, listPrice, category, quantity,
                    false, false, false, false, false, false, null);
        }
    }

    /**
     * dc-config-service price-calculations 응답 — data.lines 미러 record.
     *
     * <p>{@code @JsonIgnoreProperties(ignoreUnknown=true)} 로 응답에 다른 필드가 있어도 무시한다.
     *
     * @param lines 라인별 lineId + finalPrice 목록
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PriceCalcResult(List<Line> lines) {

        /**
         * 라인별 결과 — finalPrice 는 BigDecimal 직접 역직렬화로 부동소수 위험 제거.
         *
         * @param lineId  호출 측 임의 키 (라인 인덱스 문자열)
         * @param finalPrice DC 적용 최종 단가 (BigDecimal 정밀도 보존)
         */
        @JsonIgnoreProperties(ignoreUnknown = true)
        public record Line(String lineId, BigDecimal finalPrice) {}
    }

    /**
     * 라인별 DC 적용 단가 계산. 실패 시 빈 Map(fail-soft) — 호출자는 listPrice 사용.
     *
     * <p>P0-1 typed 역직렬화: {@code ApiResponse<PriceCalcResult>} 로 직접 역직렬화하여
     * Double 경유 부동소수 위험을 제거한다. envelope {@code success=false} 또는 data/lines null 시
     * 빈 Map 반환(fail-soft).
     *
     * @param partnerCode 거래처 코드
     * @param lines 정상가+카테고리+수량 라인 (lineId 는 호출자 임의 키)
     * @return lineId → finalPrice. 실패/미설정 시 빈 Map.
     */
    public Map<String, BigDecimal> calculatePrices(String partnerCode, List<PriceLine> lines) {
        if (partnerCode == null || partnerCode.isBlank() || lines == null || lines.isEmpty()) {
            return Map.of();
        }
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("partnerCode", partnerCode);
            body.put("callerService", CALLER);
            body.put("lines", lines.stream().map(l -> {
                Map<String, Object> m = new HashMap<>();
                m.put("lineId", l.lineId());
                m.put("modelCode", l.modelCode());
                m.put("listPrice", l.listPrice());
                m.put("category", l.category());
                m.put("quantity", l.quantity());
                m.put("is360", l.is360());
                m.put("is4Way", l.is4Way());
                m.put("is1Way", l.is1Way());
                m.put("isStand", l.isStand());
                m.put("isDeluxe", l.isDeluxe());
                m.put("isFirstGrade", l.isFirstGrade());
                m.put("fixedDiscountRate", l.fixedDiscountRate());
                return m;
            }).toList());

            // P0-1: Map<String,Object> → ApiResponse<PriceCalcResult> typed 역직렬화
            // finalPrice 가 BigDecimal 로 직접 바인딩되어 Double 경유 부동소수 위험 제거.
            ApiResponse<PriceCalcResult> envelope = restClient.post()
                    .uri("/internal/price-calculations")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (req, res) -> { /* fail-soft — no throw */ })
                    .body(new ParameterizedTypeReference<ApiResponse<PriceCalcResult>>() {});

            return extractFromTyped(envelope);
        } catch (BusinessException ex) {
            throw ex; // token 미설정 등
        } catch (RuntimeException ex) {
            log.warn("DcConfigClient calculatePrices fail-soft: {}", ex.getMessage());
            return Map.of();
        }
    }

    /**
     * typed ApiResponse 에서 lineId → finalPrice Map 을 추출한다.
     *
     * <p>envelope 가 null 이거나 {@code success=false} 또는 data/lines null 이면 빈 Map 반환(fail-soft).
     *
     * @param envelope ApiResponse&lt;PriceCalcResult&gt; — null 허용
     * @return lineId → finalPrice Map (비어 있을 수 있음)
     */
    private Map<String, BigDecimal> extractFromTyped(ApiResponse<PriceCalcResult> envelope) {
        if (envelope == null || !envelope.isSuccess()) {
            return Map.of();
        }
        PriceCalcResult data = envelope.getData();
        if (data == null || data.lines() == null) {
            return Map.of();
        }
        Map<String, BigDecimal> result = new HashMap<>();
        for (PriceCalcResult.Line line : data.lines()) {
            if (line.lineId() != null && line.finalPrice() != null) {
                result.put(line.lineId(), line.finalPrice());
            }
        }
        return result;
    }

    private String requireToken() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "samhan.internal-token 미설정");
        }
        return token;
    }
}
