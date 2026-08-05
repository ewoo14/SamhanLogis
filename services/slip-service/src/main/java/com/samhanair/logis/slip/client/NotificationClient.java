package com.samhanair.logis.slip.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
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
 * notification-service 호출 client — PR-H3 (Phase 12 Step 3) 신규.
 *
 * <p>슬립 수정/삭제 요청 워크플로우의 notification 통합:
 * <ul>
 *   <li>요청 시 — 창고 직원 / 관리자 그룹에게 SMS / 푸시 알림 (수락/거절 유도)</li>
 *   <li>수락 시 — 작성자 (요청자) 에게 "수정 가능" 알림</li>
 *   <li>거절 시 — 작성자 (요청자) 에게 "거절 사유" 알림</li>
 * </ul>
 *
 * <p>호출 endpoint: {@code POST /internal/notifications/send} (notification-service의
 * {@code NotificationInternalController}). 인증 = X-Internal-Token (notification-service 의
 * InternalTokenFilter 가 ROLE_MASTER 부여).
 *
 * <p>오류 처리 (graceful fallback) — notification 실패가 슬립 비즈니스 로직 (수락/거절) 을 막지
 * 않도록 모두 warning log + 진행. SMS/push 채널 운영 모니터링은 notification-service 의 metric.
 *
 * <p>timeout — connect 2s / read 3s (NotificationChatRoomClient 일관).
 *
 * <p>Samhan Public 이식 강조 — notification-service 자체는 Aligo SMS / FCM / SES 의존을 흡수하므로
 * 본 client 는 외부 vendor 직접 의존 없음 (notification-service 내부 격리).
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

    /** 테스트 전용 생성자 — MockRestServiceServer 와 바인딩된 RestClient 를 직접 주입한다. */
    public NotificationClient(RestClient restClient, InternalAuthProperties internalAuthProperties) {
        this.restClient = restClient;
        this.internalAuthProperties = internalAuthProperties;
    }

    /**
     * 사용자 (USER recipientType) 에게 SMS 알림 발송. PR-H3 — 작성자 (수락/거절 결과) 통지용.
     *
     * @param recipientUserId 수신자 user UUID
     * @param subject 제목 (≤200자)
     * @param body 본문 (≤2000자)
     */
    public void sendUserSms(UUID recipientUserId, String subject, String body) {
        sendInternal(Map.of(
                "recipientType", "USER",
                "recipientId", recipientUserId.toString(),
                "channel", "SMS",
                "subject", safeTruncate(subject, 200),
                "body", safeTruncate(body, 2000)));
    }

    /**
     * 외부 전화번호 (EXTERNAL_PHONE recipientType) 에게 SMS 알림. PR-H3 — 창고 직원 그룹 발송 시
     * 사용 (user UUID resolve 가 안 되는 경우 폴백, 일반적으로는 sendUserSms 우선).
     *
     * @param phone 수신 전화번호 (010-XXXX-XXXX)
     * @param subject 제목
     * @param body 본문
     */
    public void sendExternalSms(String phone, String subject, String body) {
        if (phone == null || phone.isBlank()) {
            log.debug("[NotificationClient] phone 누락 — SMS 발송 skip");
            return;
        }
        sendInternal(Map.of(
                "recipientType", "EXTERNAL_PHONE",
                "recipientAddress", phone,
                "channel", "SMS",
                "subject", safeTruncate(subject, 200),
                "body", safeTruncate(body, 2000)));
    }

    /**
     * 외부 전화번호 SMS 발송 결과를 boolean 으로 반환한다.
     *
     * <p>슬3 타배송사 발송 이력의 SENT/FAILED 판정용이다. 기존 graceful void 메서드는 유지하고,
     * 본 메서드는 notification-service 응답 envelope의 {@code data.status == SENT} 일 때만
     * {@code true}를 반환한다. HTTP 2xx 이더라도 {@code FAILED}, 빈 body 또는 상태 누락은
     * 비전송으로 처리한다.
     *
     * @param phone 수신 전화번호
     * @param subject 제목
     * @param body 본문
     * @return notification-service 가 실제 발송 완료(SENT)로 응답했는지 여부
     */
    public boolean sendExternalSmsWithResult(String phone, String subject, String body) {
        if (phone == null || phone.isBlank()) {
            log.debug("[NotificationClient] phone 누락 — SMS 발송 실패 처리");
            return false;
        }
        return sendInternalWithResult(Map.of(
                "recipientType", "EXTERNAL_PHONE",
                "recipientAddress", phone,
                "channel", "SMS",
                "subject", safeTruncate(subject, 200),
                "body", safeTruncate(body, 2000)));
    }

    /**
     * 푸시 알림 (PUSH channel). PR-H3 — mobile-staff 앱 알림용. recipientId = user UUID 필수.
     *
     * @param recipientUserId 수신자 user UUID
     * @param subject 제목
     * @param body 본문
     */
    public void sendUserPush(UUID recipientUserId, String subject, String body) {
        sendUserPushWithResult(recipientUserId, subject, body);
    }

    /** 푸시 전달 성공 여부를 durable outbox가 재시도 판정에 사용한다. */
    public boolean sendUserPushWithResult(UUID recipientUserId, String subject, String body) {
        return sendUserPushWithResult(recipientUserId, subject, body, null);
    }

    /** 저장 사건별 멱등 키를 notification-service에 전달한다. */
    public boolean sendUserPushWithResult(UUID recipientUserId, String subject, String body,
                                           UUID idempotencyKey) {
        Map<String, Object> requestBody = new java.util.HashMap<>(Map.of(
                "recipientType", "USER",
                "recipientId", recipientUserId.toString(),
                "channel", "PUSH",
                "subject", safeTruncate(subject, 200),
                "body", safeTruncate(body, 2000)));
        if (idempotencyKey != null) {
            requestBody.put("idempotencyKey", idempotencyKey.toString());
        }
        return sendInternalWithResult(requestBody);
    }

    /** 협업 수정 PUSH와 같은 사건을 알림센터 인앱 목록에도 기록한다. */
    public boolean publishUserNotificationCenter(UUID recipientUserId, String subject, String body,
                                                 UUID eventId) {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("[NotificationClient] internal token missing — notification center publish skip");
            return false;
        }
        try {
            CenterPublishEnvelope response = restClient.post()
                    .uri("/internal/notifications")
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "channel", "MESSENGER",
                            "severity", "INFO",
                            "title", safeTruncate(subject, 200),
                            "body", safeTruncate(body, 2000),
                            "targetUserId", recipientUserId,
                            "sourceService", "slip-service",
                            "sourceRefId", eventId.toString()))
                    .retrieve()
                    .body(CenterPublishEnvelope.class);
            return response != null && response.data() != null;
        } catch (Exception ex) {
            log.warn("[NotificationClient] notification center publish failed — msg={}", ex.getMessage());
            return false;
        }
    }

    private void sendInternal(Map<String, Object> requestBody) {
        sendInternalWithResult(requestBody);
    }

    private boolean sendInternalWithResult(Map<String, Object> requestBody) {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            log.warn("[NotificationClient] app.security.internal.token 미설정 — SMS/push 발송 skip");
            return false;
        }
        try {
            NotificationSendEnvelope response = restClient.post()
                    .uri(SEND_PATH)
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody)
                    .retrieve()
                    .body(NotificationSendEnvelope.class);
            boolean sent = response != null
                    && response.data() != null
                    && "SENT".equals(response.data().status());
            log.info("[NotificationClient] 발송 완료 — recipientType={} channel={}",
                    requestBody.get("recipientType"), requestBody.get("channel"));
            return sent;
        } catch (RestClientResponseException ex) {
            log.warn("[NotificationClient] notification-service 호출 실패 (graceful fallback) — status={} body={}",
                    ex.getStatusCode(), ex.getResponseBodyAsString());
        } catch (Exception ex) {
            log.warn("[NotificationClient] notification-service 호출 실패 (graceful fallback) — msg={}",
                    ex.getMessage());
        }
        return false;
    }

    /** notification-service {@code ApiResponse<T>} envelope의 발송 상태만 읽는다. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    private record NotificationSendEnvelope(NotificationSendData data) {
    }

    /** 내부 발송 응답 중 성공 판정에 필요한 상태만 보유한다. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    private record NotificationSendData(String status) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record CenterPublishEnvelope(UUID data) {
    }

    private static String safeTruncate(String value, int max) {
        if (value == null) {
            return "";
        }
        return value.length() > max ? value.substring(0, max) : value;
    }
}
