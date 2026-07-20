package com.samhanair.logis.partnerorder.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.Duration;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * M5 slip-service (8086) RPC client — confirm 흐름의 핵심. {@code POST /from-partner-order} 를
 * Idempotency-Key 헤더와 함께 호출. 응답 분기:
 *
 * <ul>
 *   <li>200 OK (멱등 replay) / 201 Created (신규) → {@link PublishResult#published(String)}</li>
 *   <li>409 Conflict (동일 키 다른 본문/race) → {@link BusinessException}(CONFLICT)</li>
 *   <li>401 Unauthorized → {@link BusinessException}(UNAUTHORIZED)</li>
 *   <li>403 Forbidden → {@link BusinessException}(FORBIDDEN)</li>
 *   <li>기타 4xx → {@link BusinessException}(INVALID_INPUT)</li>
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
    private static final String SYSTEM_MASTER_HEADER = "X-Is-System-Master";
    // Phase C5-4: X-User-Role: MASTER 헤더 주입 제거.
    // slip-service HeaderAuthenticationFilter 는 X-User-Id 단독으로 인증 성립 (C5-3).
    // /api/v1/slips/from-partner-order 경로는 /internal/ prefix 아님 → InternalTokenFilter no-op.
    // PermissionAspect MASTER bypass 는 X-Is-System-Master:true 단독 판정이므로 함께 전송한다.
    private static final String INTERNAL_CALLER_ID = "00000000-0000-0000-0000-000000000000";
    private static final String SLIP_SERVICE_BASE = "http://slip-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    public SlipServiceClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                             InternalAuthProperties internalAuthProperties) {
        // #854 하드닝: connect 2s / read 5s timeout 을 명시하여 slip-service hang 시
        // outbox processor 의 비관 락 + DB 커넥션이 무한 HTTP 대기로 점유되는 것을 막는다.
        // read 5s 는 resilience4j timelimiter.slipServiceClient(5s) 와 정렬한 상한이다.
        // DcConfigClient 와 동일하게 builder.clone() 으로 전용 사본을 만들어 싱글턴
        // loadBalancedRestClientBuilder 변이(ProductClient/InventoryClient 등으로 timeout 전파)를 차단한다.
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        rf.setReadTimeout((int) Duration.ofSeconds(5).toMillis());
        this.restClient = builder.clone()
                .baseUrl(SLIP_SERVICE_BASE)
                .requestFactory(rf)
                .build();
        this.internalAuthProperties = internalAuthProperties;
    }

    /**
     * slip-service 에 partner-order 기반 슬립 발행을 요청한다.
     * 200 멱등 replay / 201 신규 발행은 published 로 수렴하고, 409 는 충돌로 전파한다.
     *
     * @param requestPayload slip-service 가 요구하는 본문 (라인 + 거래처 정보)
     * @param idempotencyKey {@code PO-CONF-{draftSeq}} 형식 — 재시도 시 동일 키 재사용
     * @return PublishResult — published 결과
     * @throws BusinessException slip-service 4xx/5xx, 연결 실패
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
                    .header(SYSTEM_MASTER_HEADER, "true")
                    .header(IDEMPOTENCY_HEADER, idempotencyKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestPayload)
                    .retrieve()
                    .onStatus(s -> s.value() == 401, (req, res) -> {
                        throw new BusinessException(ErrorCode.UNAUTHORIZED,
                                "slip-service 401 내부 인증 실패: " + res.getStatusCode());
                    })
                    .onStatus(s -> s.value() == 403, (req, res) -> {
                        throw new BusinessException(ErrorCode.FORBIDDEN,
                                "slip-service 403 내부 권한 거부: " + res.getStatusCode());
                    })
                    .onStatus(s -> s.value() == 409, (req, res) -> {
                        throw new BusinessException(ErrorCode.CONFLICT,
                                "slip-service 409 충돌(동일 키 다른 본문/race): " + res.getStatusCode());
                    })
                    .onStatus(s -> s.is4xxClientError()
                            && s.value() != 401
                            && s.value() != 403
                            && s.value() != 409, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "slip-service 4xx: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "slip-service 5xx: " + res.getStatusCode());
                    })
                    .toEntity(new ParameterizedTypeReference<Map<String, Object>>() {});

            String slipNo = extractSlipNo(response.getBody());
            if (slipNo == null || slipNo.isBlank()) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "slip-service 응답에 slipNo 누락");
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
     * <p>응답 분기는 {@link #publishFromPartnerOrder} 와 동일하다(200/201 성공, 409 충돌, 4xx/5xx 예외).
     * 기존 {@code publishFromPartnerOrder} 는 무변경(회귀 0). URI 만 {@code /from-orders-merge}.
     *
     * @param requestPayload 병합 발행 본문 — slip-service {@code PublishFromOrdersMergeRequest} 계약에 맞는 맵.
     *                       필수 키: {@code sourceOrders}(List) / {@code lines}(List) / {@code warehouseCode}
     * @param idempotencyKey {@code PO-MRG-...} 결정적 키 (reserve referenceId 와 공용)
     * @return PublishResult — published 결과
     * @throws BusinessException slip-service 4xx/5xx, 연결 실패
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
                    .header(SYSTEM_MASTER_HEADER, "true")
                    .header(IDEMPOTENCY_HEADER, idempotencyKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestPayload)
                    .retrieve()
                    .onStatus(s -> s.value() == 401, (req, res) -> {
                        throw new BusinessException(ErrorCode.UNAUTHORIZED,
                                "slip-service 401 내부 인증 실패: " + res.getStatusCode());
                    })
                    .onStatus(s -> s.value() == 403, (req, res) -> {
                        throw new BusinessException(ErrorCode.FORBIDDEN,
                                "slip-service 403 내부 권한 거부: " + res.getStatusCode());
                    })
                    .onStatus(s -> s.value() == 409, (req, res) -> {
                        throw new BusinessException(ErrorCode.CONFLICT,
                                "slip-service 409 충돌(동일 키 다른 본문/race): " + res.getStatusCode());
                    })
                    .onStatus(s -> s.is4xxClientError()
                            && s.value() != 401
                            && s.value() != 403
                            && s.value() != 409, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                "slip-service 4xx: " + res.getStatusCode());
                    })
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "slip-service 5xx: " + res.getStatusCode());
                    })
                    .toEntity(new ParameterizedTypeReference<Map<String, Object>>() {});

            String slipNo = extractSlipNo(response.getBody());
            if (slipNo == null || slipNo.isBlank()) {
                throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                        "slip-service 병합 응답에 slipNo 누락");
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

    /** slip-service 발행 결과 — duplicate 팩토리는 기존 호출자/테스트 호환을 위해 유지한다. */
    public record PublishResult(String slipNo, boolean duplicate) {
        public static PublishResult published(String slipNo) {
            return new PublishResult(slipNo, false);
        }

        public static PublishResult duplicate(String slipNo) {
            return new PublishResult(slipNo, true);
        }
    }
}
