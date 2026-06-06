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
    private static final String USER_ID_HEADER = "X-User-Id";
    // Phase C5-4: X-User-Role: MASTER 헤더 주입 제거.
    // slip-service HeaderAuthenticationFilter 는 X-User-Id 단독으로 인증 성립 (C5-3).
    // /api/v1/slips/from-partner-order 경로는 /internal/ prefix 아님 → InternalTokenFilter no-op.
    // X-Internal-Token + X-User-Id 조합으로 인증 유지.
    private static final String INTERNAL_CALLER_ID = "00000000-0000-0000-0000-000000000000";
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
                    .uri("/api/v1/slips/from-partner-order")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .header(USER_ID_HEADER, INTERNAL_CALLER_ID)
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
                    // MIG-23 사이클 1e fix (Codex Correctness MAJOR) — 409 duplicate 명시 통과.
                    // RestClient 의 default 4xx handler 가 onStatus 미처리 status 를 throw 하므로
                    // 409 는 no-op handler 로 explicit pass 처리해야 body parse + duplicate(slipNo) 분기 도달.
                    .onStatus(s -> s.value() == 409, (req, res) -> { /* no-op, allow body parse */ })
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

    /**
     * slip-service 에 다중 주문 병합 발행을 요청한다 — Phase 2.6b D2.
     *
     * <p>응답 분기는 {@link #publishFromPartnerOrder} 와 동일하다(200 성공 / 409 멱등 duplicate / 5xx 예외).
     * 기존 {@code publishFromPartnerOrder} 는 무변경(회귀 0). URI 만 {@code /from-orders-merge}.
     *
     * @param requestPayload 병합 발행 본문 — slip-service {@code PublishFromOrdersMergeRequest} 계약에 맞는 맵.
     *                       필수 키: {@code sourceOrders}(List) / {@code lines}(List) / {@code warehouseCode}
     * @param idempotencyKey {@code PO-MRG-...} 결정적 키 (reserve referenceId 와 공용)
     * @return PublishResult — published(200) 또는 duplicate(409) 구분
     * @throws BusinessException(INTERNAL_ERROR) slip-service 5xx / 연결 실패
     */
    public PublishResult publishFromOrdersMerge(Map<String, Object> requestPayload,
                                                String idempotencyKey) {
        if (requestPayload == null || requestPayload.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "requestPayload 비어있음");
        }
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "idempotencyKey 필수");
        }

        try {
            ResponseEntity<Map<String, Object>> response = restClient.post()
                    .uri("/api/v1/slips/from-orders-merge")
                    .header(INTERNAL_TOKEN_HEADER, requireToken())
                    .header(USER_ID_HEADER, INTERNAL_CALLER_ID)
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
                    .onStatus(s -> s.value() == 409, (req, res) -> { /* no-op, allow body parse */ })
                    .toEntity(new ParameterizedTypeReference<Map<String, Object>>() {});

            String slipNo = extractSlipNo(response.getBody());
            if (slipNo == null || slipNo.isBlank()) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "slip-service 병합 응답에 slipNo 누락");
            }
            if (response.getStatusCode().value() == 409) {
                return PublishResult.duplicate(slipNo);
            }
            return PublishResult.published(slipNo);
        } catch (BusinessException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.error("SlipServiceClient merge publish failed (idemKey={}): {}",
                    idempotencyKey, ex.getMessage());
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "slip-service 병합 호출 실패", ex);
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
