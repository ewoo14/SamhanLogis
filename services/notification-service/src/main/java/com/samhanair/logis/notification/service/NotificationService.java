package com.samhanair.logis.notification.service;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.notification.adapter.NotificationGateway;
import com.samhanair.logis.notification.adapter.NotificationGatewayMetrics;
import com.samhanair.logis.notification.adapter.NotificationGatewayResult;
import com.samhanair.logis.notification.adapter.push.PushAdapter;
import com.samhanair.logis.notification.client.UserClient;
import com.samhanair.logis.notification.domain.NotificationChannel;
import com.samhanair.logis.notification.domain.NotificationLog;
import com.samhanair.logis.notification.domain.NotificationRequest;
import com.samhanair.logis.notification.domain.NotificationStatus;
import com.samhanair.logis.notification.domain.PushDeviceToken;
import com.samhanair.logis.notification.domain.RecipientType;
import com.samhanair.logis.notification.dto.NotificationSendRequest;
import com.samhanair.logis.notification.repository.NotificationLogRepository;
import com.samhanair.logis.notification.repository.NotificationRequestRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.time.LocalDateTime;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.annotation.Transactional;

/**
 * 발송 라이프사이클 service — 생성 / 조회 / 게이트웨이 호출 / 재시도.
 *
 * <p>흐름:
 * <ol>
 *   <li>{@link #send} — 요청 생성 + 채널 어댑터 호출 + log 적재 + status 전이.</li>
 *   <li>{@link #findById} — 단건 조회.</li>
 *   <li>{@link #retry} — admin 재시도 (FAILED/RETRYING 만 허용) + 어댑터 재호출.</li>
 *   <li>{@link #findAll} — 채널 / 상태 필터 페이지.</li>
 * </ol>
 *
 * <p>USER / PARTNER recipient 의 경우 user-service / partner-service 의 verify 호출 (UserClient).
 * EXTERNAL_PHONE 은 verify skip (외부 번호 — 수신자 등록 데이터 없음).
 */
@Slf4j
@Service
public class NotificationService {

    private final NotificationRequestRepository requestRepository;
    private final NotificationLogRepository logRepository;
    private final Map<NotificationChannel, NotificationGateway> gatewayMap;
    private final UserClient userClient;
    private final PushDeviceTokenService pushDeviceTokenService;
    private final NotificationDispatchPersistence dispatchPersistence;

    /**
     * 발송 재시도 최대 횟수 — post-W5 backlog cleanup (Q-W3-1 채택, D-P9-21).
     *
     * <p>{@link #retry} 호출 시점에 entity.attemptCount 가 본 임계 이상이면 영구 FAILED 처리
     * (retryable=false) — DEAD_LETTER 의미. 기본 5회 (production cutover 시 trial-and-error 학습 후 조정).
     *
     * <p>property: {@code samhan.notification.retry.max-attempts}, env: {@code SAMHAN_NOTIFICATION_RETRY_MAX_ATTEMPTS}.
     */
    private final int maxRetryAttempts;

    /**
     * 채널 × result 발송 결과 Micrometer counter — post-W5 backlog cleanup (DevOps, D-P9-21).
     * nullable — 단위 테스트는 metrics 주입 없이도 동작 (기존 회귀 안전).
     */
    private final NotificationGatewayMetrics gatewayMetrics;

    /**
     * Test-only backward-compatible constructor for unit tests that do not wire native push support.
     */
    public NotificationService(NotificationRequestRepository requestRepository,
                               NotificationLogRepository logRepository,
                               Map<NotificationChannel, NotificationGateway> gatewayMap,
                               UserClient userClient,
                               int maxRetryAttempts,
                               NotificationGatewayMetrics gatewayMetrics) {
        this(requestRepository, logRepository, gatewayMap, userClient, null, maxRetryAttempts, gatewayMetrics, null);
    }

    @Autowired
    public NotificationService(NotificationRequestRepository requestRepository,
                               NotificationLogRepository logRepository,
                               Map<NotificationChannel, NotificationGateway> gatewayMap,
                               UserClient userClient,
                               @Autowired(required = false) PushDeviceTokenService pushDeviceTokenService,
                               @Value("${samhan.notification.retry.max-attempts:5}") int maxRetryAttempts,
                               @Autowired(required = false) NotificationGatewayMetrics gatewayMetrics,
                               @Autowired(required = false) NotificationDispatchPersistence dispatchPersistence) {
        this.requestRepository = requestRepository;
        this.logRepository = logRepository;
        this.gatewayMap = gatewayMap;
        this.userClient = userClient;
        this.pushDeviceTokenService = pushDeviceTokenService;
        this.maxRetryAttempts = maxRetryAttempts;
        this.gatewayMetrics = gatewayMetrics;
        this.dispatchPersistence = dispatchPersistence;
    }

    /**
     * 발송 요청 생성 + 즉시 1회 게이트웨이 호출 + status 전이.
     *
     * @param req 발송 요청 DTO
     * @return 영속화된 NotificationRequest (status = SENT 또는 FAILED)
     */
    public NotificationRequest send(NotificationSendRequest req) {
        return sendWithGatewayResult(req).notificationRequest();
    }

    /**
     * 발송 요청 생성 + 즉시 1회 게이트웨이 호출 + status 전이. gateway 결과(msg_id / raw) 포함 반환.
     *
     * <p>공용 gateway 결과를 반환한다. 배차안내문자 Scope A는 이 공용 경로를 호출하지 않지만,
     * 다른 알림 소비자의 감사/추적 계약을 위해 유지한다.
     * 기존 {@link #send} 는 본 메서드에 위임하여 하위 호환을 유지한다.
     *
     * @param req 발송 요청 DTO
     * @return {@link SendResult} — NotificationRequest + NotificationGatewayResult 쌍
     */
    public SendResult sendWithGatewayResult(NotificationSendRequest req) {
        if (dispatchPersistence != null) {
            if (req.recipientType() == RecipientType.USER && req.recipientId() != null
                    && !userClient.exists(req.recipientId())) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "수신자(USER) 미존재: " + req.recipientId());
            }
            NotificationRequest prepared = dispatchPersistence.prepare(req);
            if (prepared.getStatus() == NotificationStatus.SENT) {
                return new SendResult(prepared, null);
            }
            NotificationGatewayResult result = invokeGatewayWithResult(prepared);
            return new SendResult(dispatchPersistence.complete(prepared), result);
        }
        if (req.idempotencyKey() != null && !req.idempotencyKey().isBlank()) {
            var existing = requestRepository.findByIdempotencyKey(req.idempotencyKey());
            if (existing.isPresent()) {
                NotificationRequest existingRequest = existing.get();
                if (existingRequest.getStatus() == NotificationStatus.SENT) {
                    return new SendResult(existingRequest, null);
                }
                NotificationGatewayResult retryResult = invokeGatewayWithResult(existingRequest);
                return new SendResult(existingRequest, retryResult);
            }
        }
        NotificationRequest entity = NotificationRequest.open(
                req.recipientType(),
                req.recipientId(),
                req.recipientAddress(),
                req.channel(),
                req.templateCode(),
                req.subject(),
                req.body(),
                req.payload(), req.idempotencyKey());

        // 수신자 검증 (USER / PARTNER 만)
        if (req.recipientType() == RecipientType.USER && req.recipientId() != null) {
            if (!userClient.exists(req.recipientId())) {
                throw new BusinessException(ErrorCode.NOT_FOUND, "수신자(USER) 미존재: " + req.recipientId());
            }
        }
        // PARTNER verify 는 partner-service client (W4 / Phase 10 시점 통합) — W3 시점 skip.

        NotificationRequest saved = requestRepository.save(entity);
        NotificationGatewayResult gatewayResult = invokeGatewayWithResult(saved);
        return new SendResult(saved, gatewayResult);
    }

    /** gateway 성공 후 complete 전에 종료된 오래된 PENDING 요청을 재처리한다. */
    @Scheduled(fixedDelayString = "${samhan.notification.pending-recovery-delay-ms:5000}")
    public void recoverPending() {
        if (dispatchPersistence == null) {
            return;
        }
        List<NotificationRequest> pending = requestRepository
                .findTop100ByStatusAndCreatedAtBeforeOrderByCreatedAtAsc(
                        NotificationStatus.PENDING, LocalDateTime.now().minusSeconds(30));
        for (NotificationRequest request : pending) {
            try {
                NotificationGatewayResult result = invokeGatewayWithResult(request);
                dispatchPersistence.complete(request);
                log.info("[NotificationService] PENDING 복구 완료 requestId={} status={}",
                        request.getId(), result.gatewayStatus());
            } catch (RuntimeException ex) {
                log.warn("[NotificationService] PENDING 복구 실패 requestId={}", request.getId(), ex);
            }
        }
    }

    /**
     * 발송 결과 — NotificationRequest + NotificationGatewayResult 쌍.
     *
     * <p>공용 알림 gateway 결과와 NotificationRequest를 함께 반환한다.
     *
     * @param notificationRequest 영속화된 발송 요청 엔티티
     * @param gatewayResult       게이트웨이 호출 결과 (msg_id / rawResponse 포함)
     */
    public record SendResult(
            NotificationRequest notificationRequest,
            NotificationGatewayResult gatewayResult) {
    }

    /** 단건 조회. 미존재 시 404. */
    @Transactional(readOnly = true)
    public NotificationRequest findById(UUID requestId) {
        return requestRepository.findById(requestId)
                .orElseThrow(() -> new BusinessException(ErrorCode.NOT_FOUND,
                        "발송 요청을 찾을 수 없습니다: " + requestId));
    }

    /**
     * admin 재시도 — FAILED/RETRYING 상태에서만 허용.
     *
     * <p>post-W5 backlog cleanup (Q-W3-1, D-P9-21) — {@link #maxRetryAttempts} 임계 초과 시
     * 영구 FAILED 처리 + DEAD_LETTER 의미 log 기록. 게이트웨이 호출 skip + retryable=false 고정.
     *
     * <p>post-W5 종합 fix (BE-2, D-P9-21) — DEAD_LETTER 분기에서도 {@link #gatewayMetrics}
     * recordFailure() 호출. 운영 단계에서 DEAD_LETTER 누적이 Grafana
     * {@code notification_gateway_send_total{result="failure"}} counter 로 가시화 (이전: 게이트웨이
     * 호출 skip 으로 metrics 증가 X → DEAD_LETTER 운영 누락 회피).
     */
    @Transactional
    public NotificationRequest retry(UUID requestId) {
        NotificationRequest req = findById(requestId);
        if (req.getAttemptCount() >= maxRetryAttempts) {
            log.warn("[NotificationService] requestId={} 최대 재시도 횟수({}) 초과 — DEAD_LETTER 영구 FAILED 처리",
                    req.getId(), maxRetryAttempts);
            req.markFailed(false);
            logRepository.save(NotificationLog.record(req, req.getAttemptCount(),
                    "FAILURE_MAX_ATTEMPTS_EXCEEDED", null,
                    "{\"error\":\"최대 재시도 횟수 초과 (max=" + maxRetryAttempts
                            + ")\",\"deadLetter\":true}"));
            if (gatewayMetrics != null) {
                gatewayMetrics.recordFailure(req.getChannel());
            }
            return req;
        }
        try {
            req.requeueForRetry();
        } catch (IllegalStateException ex) {
            throw new BusinessException(ErrorCode.CONFLICT, ex.getMessage());
        }
        invokeGatewayWithResult(req);
        return req;
    }

    /** 페이지 조회 — 채널 / 상태 필터. */
    @Transactional(readOnly = true)
    public Page<NotificationRequest> findAll(NotificationChannel channel,
                                             NotificationStatus status,
                                             Pageable pageable) {
        if (channel != null && status != null) {
            return requestRepository.findAllByChannelAndStatus(channel, status, pageable);
        }
        if (channel != null) {
            return requestRepository.findAllByChannel(channel, pageable);
        }
        if (status != null) {
            return requestRepository.findAllByStatus(status, pageable);
        }
        return requestRepository.findAll(pageable);
    }

    /**
     * 채널 어댑터 호출 + 결과에 따라 status 전이 + log 기록. caller 가 트랜잭션 보유 의무.
     *
     * <p>post-W5 backlog cleanup (DevOps, D-P9-21) — {@link NotificationGatewayMetrics} 가
     * 주입된 경우 channel × result 별 counter increment ({@code notification_gateway_send_total}
     * actuator/prometheus 노출).
     *
     * <p>{@link NotificationGatewayResult}를 포함해 공용 알림 소비자가 gateway 원문을 추적할 수 있다.
     *
     * @return 게이트웨이 호출 결과 (어댑터 미등록 시 FAILURE_NO_ADAPTER 결과 반환)
     */
    private NotificationGatewayResult invokeGatewayWithResult(NotificationRequest req) {
        if (req.getChannel() == NotificationChannel.PUSH
                && req.getRecipientType() == RecipientType.USER
                && pushDeviceTokenService != null) {
            return invokePushUserGatewayWithResult(req);
        }

        NotificationGateway gateway = gatewayMap.get(req.getChannel());
        if (gateway == null) {
            req.markFailed(false);
            NotificationGatewayResult noAdapter = NotificationGatewayResult.failure(
                    "FAILURE_NO_ADAPTER",
                    "{\"error\":\"채널 어댑터 미등록: " + req.getChannel() + "\"}");
            logRepository.save(NotificationLog.record(req, req.getAttemptCount() + 1,
                    noAdapter.gatewayStatus(), noAdapter.messageId(), noAdapter.rawResponse()));
            if (gatewayMetrics != null) {
                gatewayMetrics.recordFailure(req.getChannel());
            }
            return noAdapter;
        }
        NotificationGatewayResult result;
        try {
            result = gateway.send(req);
        } catch (Exception ex) {
            log.warn("[NotificationService] gateway 예외 channel={} requestId={} msg={}",
                    req.getChannel(), req.getId(), ex.getMessage());
            result = NotificationGatewayResult.failure("FAILURE_EXCEPTION", ex.getMessage());
        }
        if (result.success()) {
            req.markSent();
            if (gatewayMetrics != null) {
                gatewayMetrics.recordSuccess(req.getChannel());
            }
        } else {
            req.markFailed(result.retryable());
            if (gatewayMetrics != null) {
                gatewayMetrics.recordFailure(req.getChannel());
            }
        }
        logRepository.save(NotificationLog.record(
                req,
                req.getAttemptCount(),
                result.gatewayStatus(),
                result.messageId(),
                result.rawResponse()));
        return result;
    }

    /**
     * USER 수신자 PUSH 는 등록된 푸시 토큰 전체에 1회씩 발송한다.
     *
     * <p>토큰이 없는 경우 외부 gateway 호출 없이 성공 처리한다. 모바일 미설치 사용자에게 알림을
     * 보내도 형제 service 트랜잭션이 실패하지 않도록 graceful no-op 으로 남긴다.
     */
    private NotificationGatewayResult invokePushUserGatewayWithResult(NotificationRequest req) {
        List<PushDeviceToken> tokens = pushDeviceTokenService.findActiveTokens(req.getRecipientId());
        if (tokens.isEmpty()) {
            NotificationGatewayResult noToken = NotificationGatewayResult.success(
                    "push-no-token-" + req.getId(),
                    "{\"note\":\"등록된 push device token 없음\"}");
            req.markSent();
            logRepository.save(NotificationLog.record(
                    req,
                    req.getAttemptCount(),
                    noToken.gatewayStatus(),
                    noToken.messageId(),
                    noToken.rawResponse()));
            if (gatewayMetrics != null) {
                gatewayMetrics.recordSuccess(req.getChannel());
            }
            log.info("[NotificationService] PUSH USER token 없음 — graceful no-op requestId={} userId={}",
                    req.getId(), req.getRecipientId());
            return noToken;
        }

        NotificationGateway gateway = gatewayMap.get(req.getChannel());
        if (gateway == null) {
            req.markFailed(false);
            NotificationGatewayResult noAdapter = NotificationGatewayResult.failure(
                    "FAILURE_NO_ADAPTER",
                    "{\"error\":\"PUSH 채널 어댑터 미등록\"}");
            logRepository.save(NotificationLog.record(req, req.getAttemptCount(),
                    noAdapter.gatewayStatus(), noAdapter.messageId(), noAdapter.rawResponse()));
            if (gatewayMetrics != null) {
                gatewayMetrics.recordFailure(req.getChannel());
            }
            return noAdapter;
        }

        List<TokenGatewayResult> results = new ArrayList<>();
        for (PushDeviceToken token : tokens) {
            NotificationGatewayResult result = sendPushToken(gateway, req, token.getToken());
            results.add(new TokenGatewayResult(result));
        }

        // 실패가 하나라도 있으면 최종 request status 가 FAILED 로 남도록 실패 결과를 마지막에 기록한다.
        results.stream()
                .sorted(Comparator.comparing((TokenGatewayResult r) -> !r.result().success()))
                .forEach(r -> recordGatewayResult(req, r.result()));

        return results.stream()
                .map(TokenGatewayResult::result)
                .filter(result -> !result.success())
                .findFirst()
                .orElse(results.get(0).result());
    }

    private NotificationGatewayResult sendPushToken(NotificationGateway gateway,
                                                    NotificationRequest request,
                                                    String token) {
        try {
            if (gateway instanceof PushAdapter pushAdapter) {
                return pushAdapter.sendToToken(request, token);
            }
            return gateway.send(request);
        } catch (Exception ex) {
            log.warn("[NotificationService] PUSH token gateway 예외 requestId={} tokenHash={} msg={}",
                    request.getId(), Integer.toHexString(token.hashCode()), ex.getMessage());
            return NotificationGatewayResult.failure("FAILURE_EXCEPTION", ex.getMessage());
        }
    }

    private void recordGatewayResult(NotificationRequest req, NotificationGatewayResult result) {
        if (result.success()) {
            req.markSent();
            if (gatewayMetrics != null) {
                gatewayMetrics.recordSuccess(req.getChannel());
            }
        } else {
            req.markFailed(result.retryable());
            if (gatewayMetrics != null) {
                gatewayMetrics.recordFailure(req.getChannel());
            }
        }
        logRepository.save(NotificationLog.record(
                req,
                req.getAttemptCount(),
                result.gatewayStatus(),
                result.messageId(),
                result.rawResponse()));
    }

    private record TokenGatewayResult(NotificationGatewayResult result) {
    }
}
