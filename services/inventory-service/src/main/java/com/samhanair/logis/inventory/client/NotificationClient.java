package com.samhanair.logis.inventory.client;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.security.InternalAuthProperties;
import java.util.Map;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * inventory-service → notification-service 내부 알림 발송 클라이언트 (P1-3).
 *
 * <p>안전재고 임계 미만 감지 시 {@code POST /internal/notifications/send} 를 호출하여
 * 담당자(MASTER/MANAGER/INVENTORY 역할)에게 알림을 전송한다.
 *
 * <p>인증: X-Internal-Token 헤더 (SAMHAN_INTERNAL_TOKEN 환경변수).
 * recipientType = EXTERNAL_PHONE 방식 대신, subject/body 텍스트만 채운 EMAIL 채널을
 * 시스템 수신자(recipientType=USER, recipientId=null) 로 전송한다.
 * 실제 운영에서는 recipientId 에 알림 수신 담당자 UUID 를 주입해야 한다.
 *
 * <p>5xx / 연결 오류 시 경고 로그만 남기고 throw 하지 않음 — 알림 발송 실패가
 * 재고 변동 트랜잭션을 롤백해서는 안 된다 (fire-and-forget 패턴).
 */
@Component
public class NotificationClient {

    private static final Logger log = LoggerFactory.getLogger(NotificationClient.class);
    private static final String INTERNAL_TOKEN_HEADER = "X-Internal-Token";
    private static final String NOTIFICATION_SERVICE_BASE = "http://notification-service";

    private final RestClient restClient;
    private final InternalAuthProperties internalAuthProperties;

    public NotificationClient(
            @Qualifier("loadBalancedRestClientBuilder") RestClient.Builder builder,
            InternalAuthProperties internalAuthProperties) {
        this.restClient = builder.baseUrl(NOTIFICATION_SERVICE_BASE).build();
        this.internalAuthProperties = internalAuthProperties;
    }

    /**
     * 안전재고 임계 미만 알림을 notification-service 에 발송 요청한다.
     *
     * <p>발송 실패(5xx / 연결 오류 / 토큰 미설정)는 경고 로그만 남기고 예외를 전파하지 않는다.
     * 알림 발송 실패가 재고 변동 본 트랜잭션에 영향을 주어서는 안 된다.
     *
     * @param subject 알림 제목 (예: "[안전재고 경보] 제품 X 재고 부족")
     * @param body    알림 본문 (제품/창고/현재재고/임계값 정보 포함)
     */
    public void sendSafetyStockAlert(String subject, String body) {
        String token;
        try {
            token = requireToken();
        } catch (BusinessException ex) {
            log.warn("NotificationClient: internal token 미설정 — 안전재고 알림 발송 생략. subject={}", subject);
            return;
        }

        // recipientType=USER, channel=EMAIL 로 시스템 알림 발송.
        // 실제 운영에서는 recipientId 에 담당자 UUID 를 주입한다.
        Map<String, Object> requestBody = Map.of(
                "recipientType", "USER",
                "channel", "EMAIL",
                "subject", subject,
                "body", body
        );

        try {
            restClient.post()
                    .uri("/internal/notifications/send")
                    .header(INTERNAL_TOKEN_HEADER, token)
                    .header("X-User-Role", "MASTER")  // internal 호출 권한
                    .contentType(Objects.requireNonNull(MediaType.APPLICATION_JSON))
                    .body(Objects.requireNonNull(requestBody))
                    .retrieve()
                    .onStatus(HttpStatusCode::is4xxClientError, (req, res) ->
                            log.warn("NotificationClient: 4xx 응답 — subject={}, status={}",
                                    subject, res.getStatusCode()))
                    .onStatus(HttpStatusCode::is5xxServerError, (req, res) ->
                            log.warn("NotificationClient: 5xx 응답 — subject={}, status={}",
                                    subject, res.getStatusCode()))
                    .toBodilessEntity();
            log.info("NotificationClient: 안전재고 알림 발송 완료 — subject={}", subject);
        } catch (RuntimeException ex) {
            // 발송 실패는 경고 로그만 남기고 전파하지 않음 (fire-and-forget).
            log.warn("NotificationClient: 안전재고 알림 발송 실패 — subject={}, cause={}",
                    subject, ex.getMessage());
        }
    }

    private String requireToken() {
        String token = internalAuthProperties.getToken();
        if (token == null || token.isBlank()) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR,
                    "app.security.internal.token 미설정");
        }
        return token;
    }
}
