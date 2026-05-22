package com.samhanair.logis.notification.publisher;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private final RestClient restClient;
    private final String internalToken;
    private final String callerServiceName;

    public NotificationPublisher(RestClient.Builder loadBalancedBuilder,
                                 String internalToken,
                                 String callerServiceName) {
        this.restClient = loadBalancedBuilder.baseUrl(NOTIFICATION_SERVICE_BASE).build();
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
        try {
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

            restClient.post()
                    .uri("/internal/notifications")
                    .header(INTERNAL_TOKEN_HEADER, internalToken == null ? "" : internalToken)
                    .header("X-User-Id", "system-internal:" + callerServiceName)
                    .header("X-User-Role", "MASTER")
                    .body(enriched)
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException ex) {
            log.warn("[NotificationPublisher] notification-service 발송 실패 (fail-soft) — channel={} ref={} error={}",
                    req.channel(), req.sourceRefId(), ex.getMessage());
        } catch (Exception ex) {
            log.error("[NotificationPublisher] 알림 발송 예외 (fail-soft) — channel={} ref={} error={}",
                    req.channel(), req.sourceRefId(), ex.getMessage(), ex);
        }
    }
}
