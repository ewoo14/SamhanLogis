package com.samhanair.logis.partnerorder.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * dc-config-service (8089) RPC client — confirm 의 server-side DC 단가 계산.
 *
 * <p>{@code POST /internal/price-calculations} (X-Internal-Token) 로 라인별 정상가+카테고리+옵션을
 * 보내면 dc-config-service 가 DcConfig+DcRule 을 적용한 finalPrice 를 응답한다.
 *
 * <p><b>fail-soft</b>: 404(DC 미설정)/5xx/연결실패 시 빈 Map 반환 → 호출자가 listPrice 그대로 사용
 * (회계 critical path 보호 + 기존 "DC 미적용 시 정상가" 사상 보존).
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
        this.restClient = builder.baseUrl(DC_CONFIG_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
    }

    /** 가격 계산 요청 라인 — dc-config PriceCalculationRequest.Line 미러. */
    public record PriceLine(String lineId, String modelCode, BigDecimal listPrice,
                            String category, int quantity) {}

    /**
     * 라인별 DC 적용 단가 계산. 실패 시 빈 Map(fail-soft) — 호출자는 listPrice 사용.
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
                m.put("is360", false);
                m.put("is4Way", false);
                m.put("is1Way", false);
                m.put("isStand", false);
                m.put("isDeluxe", false);
                m.put("isFirstGrade", false);
                return m;
            }).toList());

            Map<String, Object> envelope = restClient.post()
                    .uri("/internal/price-calculations")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, (req, res) -> { /* fail-soft — no throw */ })
                    .body(new ParameterizedTypeReference<Map<String, Object>>() {});

            return extractFinalPrices(envelope);
        } catch (BusinessException ex) {
            throw ex; // token 미설정 등
        } catch (RuntimeException ex) {
            log.warn("DcConfigClient calculatePrices fail-soft: {}", ex.getMessage());
            return Map.of();
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, BigDecimal> extractFinalPrices(Map<String, Object> envelope) {
        if (envelope == null) {
            return Map.of();
        }
        Object data = envelope.get("data");
        if (!(data instanceof Map<?, ?> dataMap)) {
            return Map.of();
        }
        Object linesObj = ((Map<String, Object>) dataMap).get("lines");
        if (!(linesObj instanceof List<?> list)) {
            return Map.of();
        }
        Map<String, BigDecimal> result = new HashMap<>();
        for (Object o : list) {
            if (o instanceof Map<?, ?> lineMap) {
                Object lineId = ((Map<String, Object>) lineMap).get("lineId");
                Object finalPrice = ((Map<String, Object>) lineMap).get("finalPrice");
                if (lineId != null && finalPrice != null) {
                    result.put(lineId.toString(), new BigDecimal(finalPrice.toString()));
                }
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
