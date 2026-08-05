package com.samhanair.logis.notification.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.notification.adapter.NotificationGateway;
import com.samhanair.logis.notification.adapter.NotificationGatewayResult;
import com.samhanair.logis.notification.client.UserClient;
import com.samhanair.logis.notification.domain.NotificationChannel;
import com.samhanair.logis.notification.domain.NotificationRequest;
import com.samhanair.logis.notification.domain.NotificationStatus;
import com.samhanair.logis.notification.domain.RecipientType;
import com.samhanair.logis.notification.dto.NotificationSendRequest;
import com.samhanair.logis.notification.repository.NotificationLogRepository;
import com.samhanair.logis.notification.repository.NotificationRequestRepository;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * NotificationService 단위 테스트 — Spring 부팅 없음, JDK 17 한글 path 환경에서도 PASS.
 *
 * <p>커버 7 case:
 * <ol>
 *   <li>send 정상 — 게이트웨이 success → status=SENT, attemptCount=1</li>
 *   <li>send 실패 (gateway failure) → status=FAILED, attemptCount=1</li>
 *   <li>send USER + 수신자 미존재 → 404 BusinessException</li>
 *   <li>retry — FAILED 상태 → 정상 호출 가능, 재시도 후 SENT</li>
 *   <li>retry — SENT 상태 → 409 BusinessException</li>
 *   <li>findById — 미존재 → 404 BusinessException</li>
 *   <li>retry — attemptCount &gt;= maxRetryAttempts → 영구 FAILED (DEAD_LETTER, post-W5 Q-W3-1)</li>
 * </ol>
 */
class NotificationServiceTest {

    private NotificationRequestRepository requestRepository;
    private NotificationLogRepository logRepository;
    private UserClient userClient;
    private NotificationService service;
    private TestGateway pushGateway;
    private Map<NotificationChannel, NotificationGateway> gatewayMap;

    @BeforeEach
    void setup() {
        requestRepository = mock(NotificationRequestRepository.class);
        logRepository = mock(NotificationLogRepository.class);
        userClient = mock(UserClient.class);
        pushGateway = new TestGateway(NotificationChannel.PUSH);
        gatewayMap = new HashMap<>();
        gatewayMap.put(NotificationChannel.PUSH, pushGateway);
        gatewayMap.put(NotificationChannel.SMS, new TestGateway(NotificationChannel.SMS));
        // post-W5 backlog cleanup (Q-W3-1) — maxRetryAttempts default 5 (테스트 기본), metrics null (회귀 안전).
        service = new NotificationService(requestRepository, logRepository, gatewayMap, userClient, 5, null);

        // repository.save 는 입력 그대로 반환
        lenient().when(requestRepository.save(any(NotificationRequest.class)))
                .thenAnswer(inv -> inv.getArgument(0));
        lenient().when(userClient.exists(any())).thenReturn(true);
    }

    @Test
    void send_success_returns_status_sent() {
        NotificationSendRequest req = new NotificationSendRequest(
                RecipientType.EXTERNAL_PHONE, null, "01012345678",
                NotificationChannel.SMS, null, null, "본문", null);

        NotificationRequest result = service.send(req);

        assertThat(result.getStatus()).isEqualTo(NotificationStatus.SENT);
        assertThat(result.getAttemptCount()).isEqualTo(1);
        assertThat(result.getLastAttemptedAt()).isNotNull();
    }

    @Test
    void send_failure_returns_status_failed() {
        pushGateway.nextResult = NotificationGatewayResult.failure("FAILURE_TEST", "{\"error\":\"forced\"}");
        NotificationSendRequest req = new NotificationSendRequest(
                RecipientType.USER, UUID.randomUUID(), null,
                NotificationChannel.PUSH, null, "안내", "본문", null);

        NotificationRequest result = service.send(req);

        assertThat(result.getStatus()).isEqualTo(NotificationStatus.FAILED);
        assertThat(result.getAttemptCount()).isEqualTo(1);
    }

    @Test
    void sameIdempotencyKey_afterTransientFailure_retriesGateway() {
        String key = "collab-event-1";
        NotificationSendRequest req = new NotificationSendRequest(
                RecipientType.USER, UUID.randomUUID(), null,
                NotificationChannel.PUSH, null, null, "본문", key);
        pushGateway.nextResult = NotificationGatewayResult.failure(
                "FAILURE_TRANSIENT", "{\"error\":\"forced\"}");

        NotificationRequest first = service.send(req);
        pushGateway.nextResult = NotificationGatewayResult.success("msg-2", "{\"ok\":true}");
        when(requestRepository.findByIdempotencyKey(key)).thenReturn(Optional.of(first));

        NotificationService.SendResult second = service.sendWithGatewayResult(req);

        assertThat(second.notificationRequest().getStatus()).isEqualTo(NotificationStatus.SENT);
        assertThat(pushGateway.sendCount).isEqualTo(2);
    }

    @Test
    void send_missing_user_recipient_throws_404() {
        when(userClient.exists(any())).thenReturn(false);
        NotificationSendRequest req = new NotificationSendRequest(
                RecipientType.USER, UUID.randomUUID(), null,
                NotificationChannel.PUSH, null, "안내", "본문", null);

        assertThatThrownBy(() -> service.send(req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("수신자(USER) 미존재");
    }

    @Test
    void retry_after_failed_state_invokes_gateway_again() {
        // fixture: 이미 FAILED 상태 entity
        NotificationRequest entity = NotificationRequest.open(
                RecipientType.EXTERNAL_PHONE, null, "01099998888",
                NotificationChannel.SMS, null, null, "재시도", null);
        entity.markFailed(false);
        UUID id = UUID.randomUUID();
        when(requestRepository.findById(id)).thenReturn(Optional.of(entity));

        NotificationRequest result = service.retry(id);

        assertThat(result.getStatus()).isEqualTo(NotificationStatus.SENT);
        // 1차 markFailed → attemptCount=1, retry 후 markSent → attemptCount=2
        assertThat(result.getAttemptCount()).isEqualTo(2);
    }

    @Test
    void retry_when_status_sent_throws_conflict() {
        // 이미 SENT — retry 거부
        NotificationRequest entity = NotificationRequest.open(
                RecipientType.EXTERNAL_PHONE, null, "01099998888",
                NotificationChannel.SMS, null, null, "재시도", null);
        entity.markSent();
        UUID id = UUID.randomUUID();
        when(requestRepository.findById(id)).thenReturn(Optional.of(entity));

        assertThatThrownBy(() -> service.retry(id))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("실패 / 재시도중 상태에서만")
                .hasMessageNotContaining("FAILED")
                .hasMessageNotContaining("RETRYING");
    }

    @Test
    void notificationStatus_displayNames_areKoreanSsot() {
        assertThat(NotificationStatus.PENDING.getDisplayName()).isEqualTo("발송대기");
        assertThat(NotificationStatus.SENT.getDisplayName()).isEqualTo("성공");
        assertThat(NotificationStatus.FAILED.getDisplayName()).isEqualTo("실패");
        assertThat(NotificationStatus.RETRYING.getDisplayName()).isEqualTo("재시도중");
    }

    @Test
    void find_by_id_missing_throws_not_found() {
        UUID id = UUID.randomUUID();
        when(requestRepository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.findById(id))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("발송 요청을 찾을 수 없습니다");
    }

    /**
     * post-W5 backlog cleanup (Q-W3-1, D-P9-21) — maxRetryAttempts 임계 초과 시 영구 FAILED.
     *
     * <p>maxRetryAttempts=5 설정 + attemptCount=6 fixture → retry() 시점에 게이트웨이 호출 skip,
     * status=FAILED 영구 처리, log 에 FAILURE_MAX_ATTEMPTS_EXCEEDED 기록.
     */
    @Test
    void requeueForRetry_exceedsMaxAttempts_marksFailedPermanent() {
        // maxRetryAttempts=5 로 service 재구성 (metrics null 회귀 안전)
        NotificationService strict = new NotificationService(
                requestRepository, logRepository, gatewayMap, userClient, 5, null);

        // attemptCount=6 fixture (이미 한도 초과)
        NotificationRequest entity = NotificationRequest.open(
                RecipientType.EXTERNAL_PHONE, null, "01077778888",
                NotificationChannel.SMS, null, null, "max retry case", null);
        for (int i = 0; i < 6; i++) {
            entity.markFailed(false);
        }
        UUID id = UUID.randomUUID();
        when(requestRepository.findById(id)).thenReturn(Optional.of(entity));

        NotificationRequest result = strict.retry(id);

        // 영구 FAILED + retryable=false (markFailed(false) 결과 = FAILED)
        assertThat(result.getStatus()).isEqualTo(NotificationStatus.FAILED);
        // 게이트웨이 호출 skip — pushGateway 의 nextResult 변경 없이 markFailed 1회 추가 → attemptCount=7
        assertThat(result.getAttemptCount()).isGreaterThanOrEqualTo(6);
    }

    @Test
    void concurrentSamePendingRequest_entersGatewayOnlyOnce() throws Exception {
        NotificationDispatchPersistence persistence = mock(NotificationDispatchPersistence.class);
        NotificationRequest pending = NotificationRequest.open(
                RecipientType.USER, UUID.randomUUID(), null, NotificationChannel.PUSH,
                null, "안내", "본문", null, "same-event");
        when(persistence.prepare(any())).thenReturn(pending);
        when(persistence.claim(any())).thenReturn(java.util.Optional.of(pending), java.util.Optional.empty());
        CountDownLatch firstEntered = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        AtomicInteger entries = new AtomicInteger();
        UUID recipientId = UUID.randomUUID();
        pushGateway.blocking = true;
        pushGateway.firstEntered = firstEntered;
        pushGateway.releaseFirst = releaseFirst;
        pushGateway.entryCount = entries;
        NotificationService concurrent = new NotificationService(
                requestRepository, logRepository, gatewayMap, userClient,
                null, 5, null, persistence);
        NotificationSendRequest request = new NotificationSendRequest(
                RecipientType.USER, recipientId, null, NotificationChannel.PUSH,
                null, "안내", "본문", null, "same-event");

        ExecutorServicePair pair = new ExecutorServicePair();
        pair.execute(() -> concurrent.send(request));
        assertThat(firstEntered.await(2, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        pair.execute(() -> concurrent.send(request));
        Thread.sleep(100);
        assertThat(entries).as("동일 PENDING gateway 동시 진입").hasValue(1);
        releaseFirst.countDown();
        pair.await();
    }

    /** 단위 테스트용 가변 게이트웨이 — nextResult 로 success / failure 토글. */
    static class TestGateway implements NotificationGateway {
        final NotificationChannel channel;
        NotificationGatewayResult nextResult;
        int sendCount;
        boolean blocking;
        CountDownLatch firstEntered;
        CountDownLatch releaseFirst;
        AtomicInteger entryCount;

        TestGateway(NotificationChannel channel) {
            this.channel = channel;
        }

        @Override
        public NotificationChannel channel() {
            return channel;
        }

        @Override
        public NotificationGatewayResult send(NotificationRequest request) {
            sendCount++;
            if (blocking) {
                entryCount.incrementAndGet();
                firstEntered.countDown();
                try {
                    releaseFirst.await(2, java.util.concurrent.TimeUnit.SECONDS);
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                }
            }
            if (nextResult != null) {
                return nextResult;
            }
            return NotificationGatewayResult.success("test-" + request.getId(), "{\"ok\":true}");
        }
    }

    private static final class ExecutorServicePair {
        private final java.util.concurrent.ExecutorService executor =
                java.util.concurrent.Executors.newFixedThreadPool(2);

        void execute(Runnable task) { executor.execute(task); }

        void await() throws InterruptedException {
            executor.shutdown();
            assertThat(executor.awaitTermination(3, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        }
    }
}
