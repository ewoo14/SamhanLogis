package com.samhanair.logis.arologis.client;

import com.samhanair.logis.arologis.domain.ArologisNotifyStatus;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * notification-service 내부 발송 endpoint 호출 client.
 *
 * <p>아로로지스 배차 매칭 알림은 기사 휴대폰 번호를 대상으로 하는 알리고 SMS이므로
 * {@code POST /internal/notifications/send} 에 {@code EXTERNAL_PHONE + SMS} 계약으로 요청한다.
 * 알림 실패는 배차 매칭 흐름을 막지 않도록 outcome으로만 반환한다.
 */
@Slf4j
@Component
public class NotificationClient {

    private static final String SEND_PATH = "/internal/notifications/send";
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";

    private final RestClient.Builder builder;
    private final String baseUrl;
    private final String internalToken;
    private final boolean skeletonMode;

    public NotificationClient(RestClient.Builder builder,
                              @Value("${samhan.notification-service.url:http://localhost:8093}") String baseUrl,
                              @Value("${app.security.internal.token:}") String internalToken,
                              @Value("${samhan.arologis.client.skeleton-mode:true}") boolean skeletonMode) {
        this.builder = builder;
        this.baseUrl = baseUrl;
        this.internalToken = internalToken;
        this.skeletonMode = skeletonMode;
    }

    /**
     * 기존 USER 대상 알림 발송 호환 메서드.
     *
     * @param recipientUserId 수신 user UUID
     * @param channel notification-service 채널(PUSH/SMS/EMAIL)
     * @param subject 제목
     * @param body 본문
     * @return notification-service 2xx 응답 여부. skeleton-mode 에서는 기존 호환을 위해 true.
     */
    public boolean send(UUID recipientUserId, String channel, String subject, String body) {
        if (skeletonMode) {
            log.debug("NotificationClient.send skeleton-mode - USER 알림 호출 생략 userId={} channel={}",
                    recipientUserId, channel);
            return true;
        }
        if (recipientUserId == null) {
            log.warn("NotificationClient.send USER 수신자 누락 - 발송 생략");
            return false;
        }
        try {
            post(Map.of(
                    "recipientType", "USER",
                    "recipientId", recipientUserId.toString(),
                    "channel", channel,
                    "subject", safeTruncate(subject, 200),
                    "body", safeTruncate(body, 2000)), String.class);
            return true;
        } catch (Exception ex) {
            log.warn("NotificationClient.send 실패 - userId={}, msg={}", recipientUserId, ex.getMessage());
            return false;
        }
    }

    /**
     * 배차 매칭 기사 SMS를 알리고 채널로 발송한다.
     *
     * @param recipientPhone 기사 휴대폰 번호
     * @param subject 제목
     * @param body 본문
     * @return 실제 시도 여부와 notification-service 상태를 변환한 발송 outcome
     */
    public NotificationSendOutcome sendDispatchSms(String recipientPhone, String subject, String body) {
        if (skeletonMode) {
            log.info("배차 매칭 SMS skeleton-mode - 실제 발송 미시도 phone={}", recipientPhone);
            return new NotificationSendOutcome(false, null, null);
        }
        if (recipientPhone == null || recipientPhone.isBlank()) {
            log.warn("배차 매칭 SMS 수신 전화번호 누락 - 발송 생략");
            return new NotificationSendOutcome(false, null, "PHONE_MISSING");
        }
        if (internalToken == null || internalToken.isBlank()) {
            log.warn("배차 매칭 SMS 내부 토큰 미설정 - notification-service 호출 불가");
            return new NotificationSendOutcome(true, ArologisNotifyStatus.FAILED, "TOKEN_MISSING");
        }

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("recipientType", "EXTERNAL_PHONE");
        request.put("recipientAddress", recipientPhone);
        request.put("channel", "SMS");
        request.put("subject", safeTruncate(subject, 200));
        request.put("body", safeTruncate(body, 2000));

        try {
            NotificationSendEnvelope response = post(request, NotificationSendEnvelope.class);
            return mapOutcome(response == null || response.data() == null ? null : response.data().status());
        } catch (RestClientResponseException ex) {
            String code = "HTTP_" + ex.getStatusCode().value();
            log.warn("배차 매칭 SMS notification-service 응답 실패 - status={} body={}",
                    ex.getStatusCode(), ex.getResponseBodyAsString());
            return new NotificationSendOutcome(true, ArologisNotifyStatus.FAILED, code);
        } catch (Exception ex) {
            log.warn("배차 매칭 SMS notification-service 호출 실패 (fail-soft) - msg={}", ex.getMessage());
            return new NotificationSendOutcome(true, ArologisNotifyStatus.FAILED, "CLIENT_EXCEPTION");
        }
    }

    private <T> T post(Map<String, Object> requestBody, Class<T> responseType) {
        RestClient client = builder.baseUrl(baseUrl).build();
        return client.post()
                .uri(SEND_PATH)
                .header(INTERNAL_TOKEN_HEADER, internalToken)
                .contentType(MediaType.APPLICATION_JSON)
                .body(requestBody)
                .retrieve()
                .body(responseType);
    }

    private static NotificationSendOutcome mapOutcome(String status) {
        if ("SENT".equals(status)) {
            return new NotificationSendOutcome(true, ArologisNotifyStatus.SUCCESS, null);
        }
        if ("FAILED".equals(status)) {
            return new NotificationSendOutcome(true, ArologisNotifyStatus.FAILED, "SEND_FAILED");
        }
        if ("RETRYING".equals(status) || "PENDING".equals(status)) {
            return new NotificationSendOutcome(true, ArologisNotifyStatus.DELAYED, null);
        }
        return new NotificationSendOutcome(true, ArologisNotifyStatus.FAILED, "INVALID_RESPONSE");
    }

    private static String safeTruncate(String value, int max) {
        if (value == null) {
            return "";
        }
        return value.length() > max ? value.substring(0, max) : value;
    }

    private record NotificationSendEnvelope(NotificationSendData data) {}

    private record NotificationSendData(String status) {}
}
