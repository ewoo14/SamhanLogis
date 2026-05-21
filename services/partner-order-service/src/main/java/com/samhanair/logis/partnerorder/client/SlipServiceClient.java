package com.samhanair.logis.partnerorder.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * M5 slip-service (8086) RPC client — confirm 흐름의 핵심. {@code POST /from-partner-order} 를
 * Idempotency-Key 헤더와 함께 호출. 응답 분기:
 *
 * <ul>
 *   <li>200 OK → {@link PublishResult#published(String)} (slipNo 채움)</li>
 *   <li>409 Conflict (idempotency duplicate) → {@link PublishResult#duplicate(String)} (기존 slipNo)</li>
 *   <li>5xx → {@link BusinessException}(INTERNAL_ERROR) — 호출자가 outbox INSERT 로 fallback</li>
 * </ul>
 *
 * <p>회로 차단기 인스턴스: {@code slipServiceClient} (가장 중요 — 30s waitDurationInOpenState).
 *
 * <p>설계서 §3.6 + §6 (Sync REST + outbox) 의 Idempotency-Key 정책:
 * <ul>
 *   <li>최초 호출: {@code PO-CONF-{partnerCode}-{draftSeq}}</li>
 *   <li>5xx 후 outbox 재시도: 동일 키 재사용 (slip-service 가 중복 차단)</li>
 * </ul>
 */
@Component
public class SlipServiceClient {

    private static final Logger log = LoggerFactory.getLogger(SlipServiceClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";
    private static final String SLIP_SERVICE_BASE = "http://slip-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    public SlipServiceClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                             InternalAuthProperties internalAuthProperties) {
        this.restClient = builder.baseUrl(SLIP_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
    }

    /**
     * slip-service 에 partner-order 기반 슬립 발행을 요청한다. 200/409 모두 성공으로 간주
     * (409 = 동일 Idempotency-Key 재호출).
     *
     * @param requestPayload slip-service 가 요구하는 본문 (라인 + 거래처 정보)
     * @param idempotencyKey {@code PO-CONF-{draftSeq}} 형식 — 재시도 시 동일 키 재사용
     * @return PublishResult — published / duplicate 구분
     * @throws BusinessException(INTERNAL_ERROR) slip-service 5xx, 연결 실패 (호출자가 outbox 로 fallback)
     */
    public PublishResult publishFromPartnerOrder(Map<String, Object> requestPayload,
                                                 String idempotencyKey) {
        if (requestPayload == null || requestPayload.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "requestPayload 비어있음");
        }
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "idempotencyKey 필수");
        }

        try {
            ResponseEntity<Map<String, Object>> response = restClient.post()
                    .uri("/slips/from-partner-order")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .header(IDEMPOTENCY_HEADER, idempotencyKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestPayload)
                    .retrieve()
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "slip-service 5xx: " + res.getStatusCode());
                    })
                    .onStatus(s -> s.is4xxClientError() && s.value() != 409, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "slip-service 4xx: " + res.getStatusCode());
                    })
                    .toEntity(new ParameterizedTypeReference<Map<String, Object>>() {});

            String slipNo = extractSlipNo(response.getBody());
            if (slipNo == null || slipNo.isBlank()) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "slip-service 응답에 slipNo 누락");
            }
            if (response.getStatusCode().value() == 409) {
                return PublishResult.duplicate(slipNo);
            }
            return PublishResult.published(slipNo);
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("SlipServiceClient publish failed (idemKey={}): {}", idempotencyKey, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "slip-service 호출 실패", ex);
        }
    }

    private String extractSlipNo(Map<String, Object> body) {
        if (body == null) {
            return null;
        }
        Object data = body.get("data");
        if (data instanceof Map<?, ?> dataMap) {
            Object slipNo = dataMap.get("slipNo");
            return slipNo == null ? null : slipNo.toString();
        }
        Object direct = body.get("slipNo");
        return direct == null ? null : direct.toString();
    }

    private String requireToken() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "samhan.internal-token 미설정");
        }
        return token;
    }

    /** slip-service 발행 결과 — 200 (published) 와 409 (duplicate) 구분. */
    public record PublishResult(String slipNo, boolean duplicate) {
        public static PublishResult published(String slipNo) {
            return new PublishResult(slipNo, false);
        }

        public static PublishResult duplicate(String slipNo) {
            return new PublishResult(slipNo, true);
        }
    }
}
