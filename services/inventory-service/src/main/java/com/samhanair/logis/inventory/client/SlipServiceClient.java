package com.samhanair.logis.inventory.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * slip-service 호출 클라이언트 — DPS 입고 비교 endpoint (PR-E1 BE-2) 가 사용.
 *
 * <p>legacy GAS 1번 (DPS 입고기록 비교) / 16번 (품목별 DPS 입고내역 비교) 의 자동 조회 절을 위해
 * slip-service 의 입고전표 일괄 조회 endpoint 를 호출한다 —
 * {@code GET /internal/slips/inbound-lines?from=&to=} (날짜 범위 + 라인 포함 응답).
 *
 * <p>X-Internal-Token 으로 서비스 간 신뢰 (다른 client 와 동일 패턴). 응답 envelope 은
 * {@code ApiResponse<List<OutboundSlipLineSummary>>} flat 구조 — slip-service 가 (slipNo,
 * slipDate, partnerCode/Name, productCode/Name, quantity) 을 라인 단위로 평탄화하여 내려준다.
 *
 * <p>예외 매핑:
 * <ul>
 *   <li>4xx → {@link BusinessException}({@link ErrorCode#INVALID_INPUT})</li>
 *   <li>5xx / connection refused → {@link BusinessException}({@link ErrorCode#INTERNAL_ERROR})</li>
 *   <li>응답 envelope 포맷 오류 → {@link BusinessException}({@link ErrorCode#INTERNAL_ERROR})</li>
 * </ul>
 *
 * <p>IT @MockBean 격리 의무 — Eureka 비활성 환경에서 본 client 가 호출되면 500 → 본 client 는
 * IT 에서 항상 @MockBean 으로 stub 한다 (memory feedback_it_mockbean_external_clients).
 */
@Component
public class SlipServiceClient {

    private static final Logger log = LoggerFactory.getLogger(SlipServiceClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String SLIP_SERVICE_BASE = "http://slip-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;
    private final ObjectMapper objectMapper;

    public SlipServiceClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                             InternalAuthProperties internalAuthProperties,
                             ObjectMapper objectMapper) {
        this.restClient = builder.baseUrl(SLIP_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
        this.objectMapper = objectMapper;
    }

    /**
     * 입고전표 라인 일괄 조회 — DPS 입고 비교의 기대치(=slip-service) source.
     *
     * <p>slip-service {@code GET /internal/slips/inbound-lines?from=YYYY-MM-DD&to=YYYY-MM-DD} 호출.
     * 응답 envelope {@code ApiResponse<List<OutboundSlipLineSummary>>} 의 {@code data} 키만 추출.
     *
     * @param from 조회 기간 시작일 (포함, 필수)
     * @param to   조회 기간 종료일 (포함, 필수)
     * @return slipNo / slipDate / partnerCode / productCode / quantity 등이 평탄화된 라인 목록
     * @throws BusinessException(INVALID_INPUT) from/to null 또는 from &gt; to 또는 slip-service 4xx
     * @throws BusinessException(INTERNAL_ERROR) slip-service 5xx, 연결 실패, 응답 포맷 오류
     */
    @SuppressWarnings("unchecked")
    public List<OutboundSlipLineSummary> getOutboundSlips(LocalDate from, LocalDate to) {
        return getSlips("outbound-lines", from, to);
    }

    /** 기간 내 INBOUND 입고전표 라인 조회 — DPS 비교의 정본 source. */
    public List<OutboundSlipLineSummary> getInboundSlips(LocalDate from, LocalDate to) {
        return getSlips("inbound-lines", from, to);
    }

    @SuppressWarnings("unchecked")
    private List<OutboundSlipLineSummary> getSlips(String path, LocalDate from, LocalDate to) {
        if (from == null || to == null) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "조회 기간 (from / to) 은 필수입니다");
        }
        if (from.isAfter(to)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                    "from 은 to 보다 이전이어야 합니다 (from=" + from + ", to=" + to + ")");
        }

        String uri = UriComponentsBuilder.fromPath("/internal/slips/" + path)
                .queryParam("from", from.toString())
                .queryParam("to", to.toString())
                .build()
                .toUriString();

        Map<String, Object> envelope;
        try {
            envelope = restClient.get()
                    .uri(uri)
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "slip-service 4xx: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "slip-service 호출 실패: " + res.getStatusCode());
                    })
                    .body(new ParameterizedTypeReference<>() {});
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("SlipServiceClient {} 실패: {}", path, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "slip-service 호출 실패", ex);
        }

        Object data = envelope == null ? null : envelope.get("data");
        if (!(data instanceof List<?> rawList)) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "slip-service 응답 포맷 오류 (data 누락)");
        }
        return ((List<Object>) rawList).stream()
                .map(item -> objectMapper.convertValue(item, OutboundSlipLineSummary.class))
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
