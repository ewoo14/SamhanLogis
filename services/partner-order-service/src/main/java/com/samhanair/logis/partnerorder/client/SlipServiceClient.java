package com.samhanair.logis.partnerorder.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.time.Duration;
import java.nio.charset.StandardCharsets;
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
import org.springframework.util.StreamUtils;

/**
 * M5 slip-service (8086) RPC client — confirm 흐름의 핵심. {@code POST /from-partner-order} 를
 * Idempotency-Key 헤더와 함께 호출. 응답 분기:
 *
 * <ul>
 *   <li>200 OK (멱등 replay) / 201 Created (신규) → {@link PublishResult#published(String)}</li>
 *   <li>409 Conflict (동일 키 다른 본문/race) → {@link BusinessException}(CONFLICT)</li>
 *   <li>401 Unauthorized → {@link BusinessException}(UNAUTHORIZED)</li>
 *   <li>403 Forbidden → {@link BusinessException}(FORBIDDEN)</li>
 *   <li>408 Request Timeout / 429 Too Many Requests → {@link BusinessException}(INTERNAL_ERROR) —
 *       일시 오류로 간주해 5xx 와 동일하게 재시도 대상 처리(#854 R4 HIGH-B)</li>
 *   <li>기타 4xx(401/403/408/409/429 제외) → {@link BusinessException}(INVALID_INPUT)</li>
 *   <li>5xx → {@link BusinessException}(INTERNAL_ERROR) — 호출자가 outbox INSERT 로 fallback</li>
 * </ul>
 *
 * <p>회로 차단기 설정: {@code ResilienceConfig} 가 {@code slipServiceClient} 인스턴스 키를 30s
 * waitDurationInOpenState 로 등록해 두었으나(가장 중요), 이 client 자체는 그 데코레이션을
 * {@code @CircuitBreaker}/{@code CircuitBreakerFactory} 로 배선하지 않는다 — 설정만 존재하고
 * restClient 를 직접 호출한다(#854 R5 정정, 배선 자체는 이번 범위 밖).
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
    private static final String BUNDLE_CONVERSION_MESSAGE =
            "세트 품목은 판매전표 라인으로 저장할 수 없습니다. 구성품으로 전개해 주세요.";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    public SlipServiceClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                             InternalAuthProperties internalAuthProperties) {
        // #854 하드닝: connect 2s / read 5s timeout 을 명시하여 slip-service hang 시 outbox
        // processor 의 row 처리 dwell 이 lease(samhan.outbox.lease-seconds)를 넘겨 멀티 인스턴스
        // overlap 재발행을 유발하거나 HTTP 커넥션이 무한 점유되는 것을 막는다. HTTP 발행은 claim/결과
        // tx 및 비관 락 밖에서 수행하므로 락을 물지는 않으며, 이 timeout 은 per-row dwell 상한을 보장한다.
        // read 5s 는 outbox row 처리 dwell 상한이다. 참고: ResilienceConfig 가 slipServiceClient
        // circuit breaker 인스턴스를 등록해 두었으나(기본 timeLimiter 는 3s — application.yml 에
        // per-인스턴스 timeLimiter override 없음), 이 client 는 그 데코레이션을 배선하지 않고
        // restClient 를 직접 호출한다 — @CircuitBreaker/CircuitBreakerFactory 사용처 0건. 설정만
        // 존재하고 미배선 상태다(#854 R5 정정 — 종전 "resilience4j timelimiter(5s)와 정렬" 서술은
        // 배선 여부·설정값 양쪽 다 부정확했다). 향후 배선 시 두 상한을 정렬하는 것이 목적이며,
        // 데코레이션 배선 자체는 이번 범위 밖이다.
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
                    // #854 R4 HIGH-B: spec D-854-06 은 408·429 를 transient(재시도)로 명시했으나 종전
                    // 매핑은 이들을 아래 일괄 4xx 분기로 흘려 INVALID_INPUT 으로 만들었다. outbox 경로에서는
                    // INVALID_INPUT 이 영구실패 분류라 요청 타임아웃/레이트리밋이 즉시 종결되고, 동기 경로에서는
                    // 사용자에게 "잘못된 입력" 으로 오표시된다. 두 호출 모두 5xx 와 동일한 재시도 대상으로 분류한다.
                    .onStatus(s -> s.value() == 408 || s.value() == 429, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "slip-service 일시 오류(재시도 대상): " + res.getStatusCode());
                    })
                    .onStatus(s -> s.is4xxClientError()
                            && s.value() != 401
                            && s.value() != 403
                            && s.value() != 408
                            && s.value() != 409
                            && s.value() != 429, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                safeClientErrorMessage(res));
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
     *                       필수 키: {@code sourceOrders}(List) / {@code partnerId}(UUID) /
     *                       {@code lines}(List) / {@code warehouseCode}. partnerId는 코드 재조회 없이
     *                       partner-order-service가 확정한 거래처 정체성을 전달한다.
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
                    // #854 R4 HIGH-B: spec D-854-06 은 408·429 를 transient(재시도)로 명시했으나 종전
                    // 매핑은 이들을 아래 일괄 4xx 분기로 흘려 INVALID_INPUT 으로 만들었다. outbox 경로에서는
                    // INVALID_INPUT 이 영구실패 분류라 요청 타임아웃/레이트리밋이 즉시 종결되고, 동기 경로에서는
                    // 사용자에게 "잘못된 입력" 으로 오표시된다. 두 호출 모두 5xx 와 동일한 재시도 대상으로 분류한다.
                    .onStatus(s -> s.value() == 408 || s.value() == 429, (req, res) -> {
                        throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                                "slip-service 일시 오류(재시도 대상): " + res.getStatusCode());
                    })
                    .onStatus(s -> s.is4xxClientError()
                            && s.value() != 401
                            && s.value() != 403
                            && s.value() != 408
                            && s.value() != 409
                            && s.value() != 429, (req, res) -> {
                        throw new BusinessException(ErrorCode.INVALID_INPUT,
                                safeClientErrorMessage(res));
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

    /** 다운스트림 4xx 중 사용자 조치가 확정된 BUNDLE 안내만 경계를 넘어 전달한다. */
    private String safeClientErrorMessage(org.springframework.http.client.ClientHttpResponse response) {
        try {
            String body = StreamUtils.copyToString(response.getBody(), StandardCharsets.UTF_8);
            if (body.contains(BUNDLE_CONVERSION_MESSAGE)) {
                return BUNDLE_CONVERSION_MESSAGE;
            }
        } catch (java.io.IOException ex) {
            log.debug("slip-service 4xx 응답 본문을 읽지 못함: {}", ex.getMessage());
        }
        return "slip-service 4xx 오류";
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
