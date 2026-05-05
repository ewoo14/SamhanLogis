package com.samhanair.logis.partnerorder.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.partnerorder.config.InternalAuthProperties;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * M3 dc-config-service (8089) RPC client. confirm 흐름에서 server-side priceVat (DC 적용 후
 * 단가) 를 받기 위해 호출. 응답은 {@code {homeDiscount, commDiscount, ..., effectivePrice}} 형식
 * 의 Map (M3 schema 확정 전이므로 wire-format Map 으로 받음).
 *
 * <p>회로 차단기 인스턴스: {@code dcConfigClient}.
 *
 * <p><b>가드 (M3 일관)</b> — 본 client 가 받은 DC 9키 ({@code homeDiscount=0.45} 등) 는 절대
 * client 응답에 노출 X. server-side priceVat 계산용으로만 사용.
 */
@Component
public class DcConfigClient {

    private static final Logger log = LoggerFactory.getLogger(DcConfigClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String DC_CONFIG_SERVICE_BASE = "http://dc-config-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    public DcConfigClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                          InternalAuthProperties internalAuthProperties,
                          ObjectMapper objectMapper) {
        this.restClient = builder.baseUrl(DC_CONFIG_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * 거래처 DC 설정 조회 — server-side priceVat 적용용. 응답은 {@code {key: value}} Map 형식.
     *
     * @param partnerCode 거래처 코드
     * @return DC 설정 Map (homeDiscount, commDiscount, singleDiscount, ...). 실패 시 빈 Map (fail-soft).
     * @throws BusinessException(INTERNAL_ERROR) 4xx + token 미설정
     */
    public Map<String, Object> fetchDcConfig(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "partnerCode 필수");
        }

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> body = restClient.get()
                    .uri("/api/v1/dc-configs/{partnerCode}", partnerCode)
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        // 404 (DC 미설정) 은 빈 Map 으로 fallback — controller 가 catch
                        if (res.getStatusCode().value() != 404) {
                            throw new BusinessException(ErrorCode.INVALID_INPUT,
                                    "dc-config-service 4xx: " + res.getStatusCode());
                        }
                    })
                    .body(Map.class);
            return body == null ? Map.of() : body;
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.warn("DcConfigClient fail-soft: {}", ex.getMessage());
            // fail-soft — DC 미적용으로 진행 (legacy 동작 보존)
            return Map.of();
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
