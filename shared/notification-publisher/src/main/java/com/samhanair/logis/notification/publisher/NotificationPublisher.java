package com.samhanair.logis.notification.publisher;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * 통합 알림 센터 발송 client — source service 가 호출 (Issue 4 Slice 3).
 *
 * <p>notification-service 의 {@code POST /internal/notifications} endpoint 를 호출하여 row INSERT.
 * X-Internal-Token 헤더와 내부 사용자 헤더를 자동 첨부한다.
 *
 * <p>장애 격리 정책: 호출 실패 시 warn log 만 남기고 throw 하지 않음 (fail-soft).
 * 알림 누락은 운영 모니터링 책임이며, source service 의 트랜잭션에 영향 주지 않는다.
 *
 * <p>등록은 {@link NotificationPublisherAutoConfiguration} 가 담당.
 */
public class NotificationPublisher {

    private static final Logger log = LoggerFactory.getLogger(NotificationPublisher.class);
    private static final String NOTIFICATION_SERVICE_BASE = "http://notification-service";
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    static final int DEFAULT_CONNECT_TIMEOUT_MS = 1_000;
    static final int DEFAULT_READ_TIMEOUT_MS = 2_000;

    private final RestClient restClient;
    private final String internalToken;
    private final String callerServiceName;

    public NotificationPublisher(RestClient.Builder loadBalancedBuilder,
                                 String internalToken,
                                 String callerServiceName) {
        this(loadBalancedBuilder, internalToken, callerServiceName,
                DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_READ_TIMEOUT_MS);
    }

    public NotificationPublisher(RestClient.Builder loadBalancedBuilder,
                                 String internalToken,
                                 String callerServiceName,
                                 int connectTimeoutMs,
                                 int readTimeoutMs) {
        this(loadBalancedBuilder, internalToken, callerServiceName,
                connectTimeoutMs, readTimeoutMs, NOTIFICATION_SERVICE_BASE);
    }

    NotificationPublisher(RestClient.Builder loadBalancedBuilder,
                          String internalToken,
                          String callerServiceName,
                          int connectTimeoutMs,
                          int readTimeoutMs,
                          String notificationServiceBase) {
        if (connectTimeoutMs <= 0 || readTimeoutMs <= 0) {
            throw new IllegalArgumentException("notification publisher timeout must be positive");
        }
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(connectTimeoutMs);
        requestFactory.setReadTimeout(readTimeoutMs);
        this.restClient = loadBalancedBuilder.clone()
                .baseUrl(notificationServiceBase)
                .requestFactory(requestFactory)
                .build();
        this.internalToken = internalToken;
        this.callerServiceName = (callerServiceName == null || callerServiceName.isBlank())
                ? "unknown" : callerServiceName;
    }

    /**
     * 알림 발송 — fail-soft. notification-service 다운 또는 4xx/5xx 시 warn log + return.
     *
     * @param req 발송 요청 (sourceService 는 본 publisher 가 자동 set)
     */
    public void publish(NotificationPublishRequest req) {
        NotificationPublishRequest enriched = new NotificationPublishRequest(
                req.channel(),
                req.severity(),
                req.title(),
                req.body(),
                req.targetRole(),
                req.targetUserId(),
                callerServiceName,
                req.sourceRefId(),
                req.deeplink());
        try {
            restClient.post()
                    .uri("/internal/notifications")
                    .header(INTERNAL_TOKEN_HEADER, internalToken == null ? "" : internalToken)
                    .header("X-User-Id", "system-internal:" + callerServiceName)
                    .header("X-User-Role", "MASTER")
                    .body(enriched)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException ex) {
            // 응답이 끊겨도 notification-service가 이미 INSERT했을 수 있으므로 재전송하지 않는다.
            log.warn("[NotificationPublisher] notification-service 발송 실패 (단일 시도, fail-soft) — channel={} ref={} error={}",
                    req.channel(), req.sourceRefId(), ex.getMessage());
        } catch (Exception ex) {
            log.error("[NotificationPublisher] 알림 발송 예외 (fail-soft) — channel={} ref={} error={}",
                    req.channel(), req.sourceRefId(), ex.getMessage(), ex);
        }
    }
}
