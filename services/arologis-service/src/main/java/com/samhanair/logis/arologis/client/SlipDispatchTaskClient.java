package com.samhanair.logis.arologis.client;

import com.samhanair.logis.arologis.dto.dispatch.SlipDispatchCancellationAcceptedRequest;
import com.samhanair.logis.arologis.dto.dispatch.SlipDispatchCancellationRejectedRequest;
import com.samhanair.logis.arologis.dto.dispatch.SlipDispatchConfirmRequest;
import com.samhanair.logis.arologis.dto.dispatch.SlipDispatchModificationAcceptedRequest;
import com.samhanair.logis.arologis.dto.dispatch.SlipDispatchModificationRejectedRequest;
import com.samhanair.logis.arologis.dto.dispatch.SlipDispatchUnavailableRequest;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * slip-service 의 dispatch-task 회신 endpoint 호출 client — Samhan Public BE Task B13 (Phase A) +
 * BE Task B7 (Phase C).
 *
 * <p>endpoint 6종:
 * <ul>
 *   <li>POST /internal/slip/dispatch-tasks/{taskId}/confirm — 매칭 완료 회신 (Phase A)</li>
 *   <li>POST /internal/slip/dispatch-tasks/{taskId}/unavailable — 매칭 불가 회신 (Phase A)</li>
 *   <li>POST /internal/slip/dispatch-tasks/{taskId}/modification-accepted (Phase C)</li>
 *   <li>POST /internal/slip/dispatch-tasks/{taskId}/modification-rejected (Phase C)</li>
 *   <li>POST /internal/slip/dispatch-tasks/{taskId}/cancellation-accepted (Phase C)</li>
 *   <li>POST /internal/slip/dispatch-tasks/{taskId}/cancellation-rejected (Phase C)</li>
 * </ul>
 *
 * <p>retry 정책: 3 회 + backoff 1/2/4s (시간 여유 — 매칭은 비동기). 실패 시 graceful fallback
 * (warn log + 진행). slip-service 가 down 이어도 arologis 자체 매칭 상태는 변경 완료.
 */
@Slf4j
@Component
public class SlipDispatchTaskClient {

    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String CONFIRM_PATH = "/internal/slip/dispatch-tasks/{taskId}/confirm";
    private static final String UNAVAILABLE_PATH = "/internal/slip/dispatch-tasks/{taskId}/unavailable";
    // Phase C
    private static final String MODIFICATION_ACCEPTED_PATH =
            "/internal/slip/dispatch-tasks/{taskId}/modification-accepted";
    private static final String MODIFICATION_REJECTED_PATH =
            "/internal/slip/dispatch-tasks/{taskId}/modification-rejected";
    private static final String CANCELLATION_ACCEPTED_PATH =
            "/internal/slip/dispatch-tasks/{taskId}/cancellation-accepted";
    private static final String CANCELLATION_REJECTED_PATH =
            "/internal/slip/dispatch-tasks/{taskId}/cancellation-rejected";
    private static final int MAX_RETRIES = 3;

    private final RestClient restClient;
    private final String internalToken;
    private final boolean skeletonMode;

    public SlipDispatchTaskClient(RestClient.Builder builder,
                                  @Value("${samhan.slip-service.url:http://slip-service:8086}") String baseUrl,
                                  @Value("${app.security.internal.token:}") String internalToken,
                                  @Value("${samhan.arologis.client.skeleton-mode:true}") boolean skeletonMode) {
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        rf.setReadTimeout((int) Duration.ofSeconds(5).toMillis());
        this.restClient = builder
                .baseUrl(baseUrl)
                .requestFactory(rf)
                .build();
        this.internalToken = internalToken;
        this.skeletonMode = skeletonMode;
    }

    /** 매칭 완료 회신 — retry 3x backoff 1/2/4s. fail-soft. */
    public boolean confirm(UUID samhanDispatchTaskId, SlipDispatchConfirmRequest request) {
        if (skeletonMode) {
            log.debug("[SlipDispatchTaskClient] skeleton-mode — confirm 호출 회피 taskId={}",
                    samhanDispatchTaskId);
            return true;
        }
        return doPost(CONFIRM_PATH, samhanDispatchTaskId, request);
    }

    /** 매칭 불가 회신 — retry 3x backoff 1/2/4s. fail-soft. */
    public boolean unavailable(UUID samhanDispatchTaskId, SlipDispatchUnavailableRequest request) {
        if (skeletonMode) {
            log.debug("[SlipDispatchTaskClient] skeleton-mode — unavailable 호출 회피 taskId={}",
                    samhanDispatchTaskId);
            return true;
        }
        return doPost(UNAVAILABLE_PATH, samhanDispatchTaskId, request);
    }

    // ---------- Phase C 회신 4 메서드 ----------

    /** 수정 수락 회신 — Phase C (D-DC-04). */
    public boolean modificationAccepted(UUID samhanDispatchTaskId, UUID arologisDispatchId) {
        if (skeletonMode) {
            log.debug("[SlipDispatchTaskClient] skeleton-mode — modificationAccepted 호출 회피 taskId={}",
                    samhanDispatchTaskId);
            return true;
        }
        return doPost(MODIFICATION_ACCEPTED_PATH, samhanDispatchTaskId,
                new SlipDispatchModificationAcceptedRequest(arologisDispatchId, Instant.now()));
    }

    /** 수정 거부 회신 — Phase C (D-DC-06). */
    public boolean modificationRejected(UUID samhanDispatchTaskId, UUID arologisDispatchId,
                                        String rejectionReason) {
        if (skeletonMode) {
            log.debug("[SlipDispatchTaskClient] skeleton-mode — modificationRejected 호출 회피 taskId={}",
                    samhanDispatchTaskId);
            return true;
        }
        return doPost(MODIFICATION_REJECTED_PATH, samhanDispatchTaskId,
                new SlipDispatchModificationRejectedRequest(arologisDispatchId, rejectionReason));
    }

    /** 취소 수락 회신 — Phase C (D-DC-05). */
    public boolean cancellationAccepted(UUID samhanDispatchTaskId, UUID arologisDispatchId) {
        if (skeletonMode) {
            log.debug("[SlipDispatchTaskClient] skeleton-mode — cancellationAccepted 호출 회피 taskId={}",
                    samhanDispatchTaskId);
            return true;
        }
        return doPost(CANCELLATION_ACCEPTED_PATH, samhanDispatchTaskId,
                new SlipDispatchCancellationAcceptedRequest(arologisDispatchId, Instant.now()));
    }

    /** 취소 거부 회신 — Phase C (D-DC-06). */
    public boolean cancellationRejected(UUID samhanDispatchTaskId, UUID arologisDispatchId,
                                        String rejectionReason) {
        if (skeletonMode) {
            log.debug("[SlipDispatchTaskClient] skeleton-mode — cancellationRejected 호출 회피 taskId={}",
                    samhanDispatchTaskId);
            return true;
        }
        return doPost(CANCELLATION_REJECTED_PATH, samhanDispatchTaskId,
                new SlipDispatchCancellationRejectedRequest(arologisDispatchId, rejectionReason));
    }

    private boolean doPost(String path, UUID taskId, Object body) {
        if (internalToken == null || internalToken.isBlank()) {
            log.warn("[SlipDispatchTaskClient] app.security.internal.token 미설정 — 호출 skip");
            return false;
        }
        for (int attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                restClient.post()
                        .uri(path, taskId)
                        .header(INTERNAL_TOKEN_HEADER, internalToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(body)
                        .retrieve()
                        .toBodilessEntity();
                log.info("[SlipDispatchTaskClient] 회신 완료 — path={} taskId={} attempt={}",
                        path, taskId, attempt);
                return true;
            } catch (RestClientResponseException ex) {
                log.warn("[SlipDispatchTaskClient] 회신 실패 — path={} taskId={} status={} attempt={}/{} body={}",
                        path, taskId, ex.getStatusCode(), attempt, MAX_RETRIES,
                        ex.getResponseBodyAsString());
                if (ex.getStatusCode().is4xxClientError()) {
                    // 4xx 는 재시도 의미 X — bailout
                    return false;
                }
            } catch (Exception ex) {
                log.warn("[SlipDispatchTaskClient] 회신 예외 — path={} taskId={} attempt={}/{} msg={}",
                        path, taskId, attempt, MAX_RETRIES, ex.getMessage());
            }
            if (attempt < MAX_RETRIES) {
                sleep(1000L * (1L << (attempt - 1)));  // 1s / 2s
            }
        }
        log.error("[SlipDispatchTaskClient] 회신 최종 실패 — path={} taskId={}", path, taskId);
        return false;
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        }
    }
}
