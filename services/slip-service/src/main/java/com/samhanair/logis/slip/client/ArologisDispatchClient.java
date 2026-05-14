package com.samhanair.logis.slip.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import com.samhanair.logis.slip.dto.dispatch.ArologisCancellationRequest;
import com.samhanair.logis.slip.dto.dispatch.ArologisDispatchRequest;
import com.samhanair.logis.slip.dto.dispatch.ArologisDispatchResponse;
import com.samhanair.logis.slip.dto.dispatch.ArologisModificationRequest;
import java.time.Duration;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * arologis-service 호출 client — Samhan Public 배차 메뉴 Phase A (BE Task B8).
 *
 * <p>호출 endpoint: {@code POST /internal/arologis/dispatches} (X-Internal-Token).
 * Eureka 의 {@code arologis-service} 로 load-balanced.
 *
 * <p>timeout — connect 2s / read 5s (NotificationClient 보다 조금 길게 — 매칭 trigger 시간 여유).
 *
 * <p>오류 처리: notification 과 달리 본 호출은 배차 완료의 핵심 단계라 실패 시
 * BusinessException(CONFLICT) 으로 캐스케이드 — service 레이어가 트랜잭션 롤백 + 사용자 에러 응답.
 */
@Component
public class ArologisDispatchClient {

    private static final Logger log = LoggerFactory.getLogger(ArologisDispatchClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String AROLOGIS_BASE = "http://arologis-service";
    private static final String DISPATCH_PATH = "/internal/arologis/dispatches";
    // Phase C (BE Task B2)
    private static final String MODIFICATION_REQUEST_PATH =
            "/internal/arologis/dispatches/{id}/modification-request";
    private static final String CANCELLATION_REQUEST_PATH =
            "/internal/arologis/dispatches/{id}/cancellation-request";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    @Autowired
    public ArologisDispatchClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                                  InternalAuthProperties internalAuthProperties) {
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        rf.setReadTimeout((int) Duration.ofSeconds(5).toMillis());
        this.restClient = builder
                .baseUrl(AROLOGIS_BASE)
                .requestFactory(rf)
                .build();
        this.internalAuthProperties = internalAuthProperties;
    }

    /**
     * 테스트 전용 생성자 — RestClient 인스턴스 직접 주입 (MockRestServiceServer bind 가능).
     */
    ArologisDispatchClient(RestClient restClient, InternalAuthProperties internalAuthProperties) {
        this.restClient = restClient;
        this.internalAuthProperties = internalAuthProperties;
    }

    /**
     * 배차 발송 — arologis 가 수신 후 비동기 매칭 trigger.
     *
     * @param request 배차 payload (차량 그룹 + 정차 슬립 snapshot)
     * @return arologis ack 응답 (arologisDispatchId 포함)
     * @throws BusinessException(CONFLICT) 호출 실패 시 (트랜잭션 롤백 가드)
     */
    public ArologisDispatchResponse send(ArologisDispatchRequest request) {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("[ArologisDispatchClient] app.security.internal.token 미설정");
            throw new BusinessException(ErrorCode.CONFLICT, "내부 인증 토큰 미설정 — 배차 발송 불가");
        }
        try {
            ArologisDispatchResponse res = restClient.post()
                    .uri(DISPATCH_PATH)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(request)
                    .retrieve()
                    .body(ArologisDispatchResponse.class);
            log.info("[ArologisDispatchClient] 발송 완료 — taskCode={} arologisDispatchId={}",
                    request.taskCode(), res != null ? res.arologisDispatchId() : null);
            return res;
        } catch (RestClientResponseException ex) {
            log.error("[ArologisDispatchClient] arologis-service 호출 실패 — status={} body={}",
                    ex.getStatusCode(), ex.getResponseBodyAsString());
            throw new BusinessException(ErrorCode.CONFLICT,
                    "arologis 발송 실패 — status=" + ex.getStatusCode());
        } catch (Exception ex) {
            log.error("[ArologisDispatchClient] arologis-service 호출 예외 — msg={}", ex.getMessage());
            throw new BusinessException(ErrorCode.CONFLICT,
                    "arologis 발송 실패 — " + ex.getMessage());
        }
    }

    /**
     * 배차 수정 요청 발송 — Phase C (D-DC-02). DISPATCHED → MODIFICATION_REQUESTED 전이 직후 호출.
     *
     * @param arologisDispatchId arologis 측 Dispatch UUID (DispatchTask 의 매핑 id)
     * @param request samhanDispatchTaskId + reason
     * @throws BusinessException(CONFLICT) 호출 실패 시 (트랜잭션 롤백 가드)
     */
    public void requestModification(UUID arologisDispatchId, ArologisModificationRequest request) {
        sendDecisionRequest(MODIFICATION_REQUEST_PATH, arologisDispatchId, request, "수정 요청");
    }

    /**
     * 배차 취소 요청 발송 — Phase C (D-DC-02). DISPATCHED → CANCEL_REQUESTED 전이 직후 호출.
     *
     * @param arologisDispatchId arologis 측 Dispatch UUID
     * @param request samhanDispatchTaskId + reason
     * @throws BusinessException(CONFLICT) 호출 실패 시 (트랜잭션 롤백 가드)
     */
    public void requestCancellation(UUID arologisDispatchId, ArologisCancellationRequest request) {
        sendDecisionRequest(CANCELLATION_REQUEST_PATH, arologisDispatchId, request, "취소 요청");
    }

    private void sendDecisionRequest(String path, UUID arologisDispatchId, Object body, String label) {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("[ArologisDispatchClient] app.security.internal.token 미설정 — {} 발송 불가", label);
            throw new BusinessException(ErrorCode.CONFLICT, "내부 인증 토큰 미설정 — " + label + " 발송 불가");
        }
        try {
            restClient.post()
                    .uri(path, arologisDispatchId)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .toBodilessEntity();
            log.info("[ArologisDispatchClient] {} 발송 완료 — arologisDispatchId={}", label, arologisDispatchId);
        } catch (RestClientResponseException ex) {
            log.error("[ArologisDispatchClient] {} 발송 실패 — status={} body={}",
                    label, ex.getStatusCode(), ex.getResponseBodyAsString());
            throw new BusinessException(ErrorCode.CONFLICT,
                    label + " 발송 실패 — status=" + ex.getStatusCode());
        } catch (Exception ex) {
            log.error("[ArologisDispatchClient] {} 발송 예외 — msg={}", label, ex.getMessage());
            throw new BusinessException(ErrorCode.CONFLICT,
                    label + " 발송 실패 — " + ex.getMessage());
        }
    }
}
