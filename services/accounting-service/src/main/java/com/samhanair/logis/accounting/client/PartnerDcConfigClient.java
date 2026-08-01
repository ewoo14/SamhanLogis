package com.samhanair.logis.accounting.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.math.BigDecimal;
import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * 거래처별 전역DC를 dc-config-service에서 조회하는 accounting 내부 client.
 *
 * <p>일마감 할인율 판정은 전역DC 미조회와 45% 기본값을 같은 상태로 취급하지 않는다.
 * 따라서 조회 결과의 존재 여부를 {@link LookupResult}로 보존한다.
 */
@Component
public class PartnerDcConfigClient {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String DC_CONFIG_SERVICE_BASE = "http://dc-config-service";
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(2);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(3);

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    @Autowired
    public PartnerDcConfigClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                                 InternalAuthProperties internalAuthProperties,
                                 ObjectMapper objectMapper) {
        this.restClient = builder.baseUrl(DC_CONFIG_SERVICE_BASE)
                .requestFactory(timeoutRequestFactory())
                .build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /** 실제 HTTP 장애를 재현하는 테스트에서만 사용하는 client 주입 경로. */
    PartnerDcConfigClient(RestClient restClient, InternalAuthProperties internalAuthProperties,
                          ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /** 실 서비스 장애가 일마감 상세의 무한 대기로 번지지 않도록 제한시간을 적용한다. */
    static SimpleClientHttpRequestFactory timeoutRequestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) CONNECT_TIMEOUT.toMillis());
        factory.setReadTimeout((int) READ_TIMEOUT.toMillis());
        return factory;
    }

    /** 거래처코드로 홈멀티·상업멀티 전역DC를 조회한다. */
    public LookupResult findByPartnerCode(String partnerCode) {
        if (partnerCode == null || partnerCode.isBlank()) {
            return LookupResult.notFound();
        }
        try {
            Map<String, Object> envelope = restClient.get()
                    .uri("/internal/partner-dc-configs/{partnerCode}", partnerCode)
                    .header(INTERNAL_TOKEN_HEADER, internalAuthProperties.getToken())
                    .retrieve()
                    .onStatus(status -> status.value() == 404,
                            (req, res) -> { throw new DcConfigNotFoundException(); })
                    .onStatus(HttpStatusCode::isError,
                            (req, res) -> { throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                    "dc-config-service 전역DC 조회 실패: " + res.getStatusCode()); })
                    .body(new ParameterizedTypeReference<>() {});
            Object data = envelope == null ? null : envelope.get("data");
            if (!(data instanceof Map<?, ?> raw)) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "dc-config-service 전역DC 응답 포맷 오류 (data 누락)");
            }
            BigDecimal home = decimal(raw.get("homeDiscountRate"));
            BigDecimal commercial = decimal(raw.get("commercialDiscountRate"));
            return LookupResult.found(home, commercial);
        } catch (DcConfigNotFoundException ex) {
            return LookupResult.notFound();
        } catch (BusinessException ex) {
            return LookupResult.unavailable();
        } catch (RuntimeException ex) {
            return LookupResult.unavailable();
        }
    }

    private BigDecimal decimal(Object value) {
        if (value == null) {
            return null;
        }
        return objectMapper.convertValue(value, BigDecimal.class);
    }

    private static final class DcConfigNotFoundException extends RuntimeException {
    }

    /** 전역DC 조회 상태와 두 멀티 유형의 원천 비율을 함께 보존한다. */
    public record LookupResult(Status status, BigDecimal homeRate, BigDecimal commercialRate) {
        public enum Status { FOUND, NOT_FOUND, UNAVAILABLE }

        public static LookupResult found(BigDecimal homeRate, BigDecimal commercialRate) {
            return new LookupResult(Status.FOUND, homeRate, commercialRate);
        }

        public static LookupResult notFound() {
            return new LookupResult(Status.NOT_FOUND, null, null);
        }

        public static LookupResult unavailable() {
            return new LookupResult(Status.UNAVAILABLE, null, null);
        }

        public boolean found() {
            return status == Status.FOUND;
        }
    }
}
