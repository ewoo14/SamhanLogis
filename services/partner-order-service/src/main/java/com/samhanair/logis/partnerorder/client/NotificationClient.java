package com.samhanair.logis.partnerorder.client;

import com.samhanair.logis.security.InternalAuthProperties;
import java.time.Duration;
import java.util.Map;
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
 * notification-service 호출 client.
 *
 * <p>주문 협업 수정완료 알림은 notification-service 내부 endpoint
 * {@code POST /internal/notifications/send} 로 push 발송한다. 알림 실패가 주문 mutation 을
 * 막지 않도록 graceful fallback 으로 처리한다.
 */
@Component
public class NotificationClient {

    private static final Logger log = LoggerFactory.getLogger(NotificationClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String NOTIFICATION_SERVICE_BASE = "http://notification-service";
    private static final String SEND_PATH = "/internal/notifications/send";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    @Autowired
    public NotificationClient(@Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
                              InternalAuthProperties internalAuthProperties) {
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        rf.setReadTimeout((int) Duration.ofSeconds(3).toMillis());
        this.restClient = builder
                .baseUrl(NOTIFICATION_SERVICE_BASE)
                .requestFactory(rf)
                .build();
        this.internalAuthProperties = internalAuthProperties;
    }

    NotificationClient(RestClient restClient, InternalAuthProperties internalAuthProperties) {
        this.restClient = restClient;
        this.internalAuthProperties = internalAuthProperties;
    }

    /**
     * 푸시 알림 (PUSH channel). recipientId = user UUID 필수.
     *
     * @param recipientUserId 수신자 user UUID
     * @param subject 제목
     * @param body 본문
     */
    public void sendUserPush(UUID recipientUserId, String subject, String body) {
        sendInternal(Map.of(
                "recipientType", "USER",
                "recipientId", recipientUserId.toString(),
                "channel", "PUSH",
                "subject", safeTruncate(subject, 200),
                "body", safeTruncate(body, 2000)));
    }

    /** 주문 확정 후 외부 거래처 확인 메일을 notification-service에 기록·전달한다. */
    public void sendExternalEmail(String recipientAddress, String subject, String body) {
        if (recipientAddress == null || recipientAddress.isBlank()) {
            return;
        }
        sendInternal(Map.of(
                "recipientType", "EXTERNAL_EMAIL",
                "recipientAddress", safeTruncate(recipientAddress, 200),
                "channel", "EMAIL",
                "subject", safeTruncate(subject, 200),
                "body", safeTruncate(body, 2000)));
    }

    private void sendInternal(Map<String, Object> requestBody) {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("[NotificationClient] app.security.internal.token 미설정 — push 발송 skip");
            return;
        }
        try {
            restClient.post()
                    .uri(SEND_PATH)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody)
                    .retrieve()
                    .toBodilessEntity();
            log.info("[NotificationClient] 발송 완료 — recipientType={} channel={}",
                    requestBody.get("recipientType"), requestBody.get("channel"));
        } catch (RestClientResponseException ex) {
            log.warn("[NotificationClient] notification-service 호출 실패 (graceful fallback) — status={} body={}",
                    ex.getStatusCode(), ex.getResponseBodyAsString());
        } catch (Exception ex) {
            log.warn("[NotificationClient] notification-service 호출 실패 (graceful fallback) — msg={}",
                    ex.getMessage());
        }
    }

    private static String safeTruncate(String value, int max) {
        if (value == null) {
            return "";
        }
        return value.length() > max ? value.substring(0, max) : value;
    }
}
