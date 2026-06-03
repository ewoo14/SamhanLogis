package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.domain.Slip;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 보상 실패 발생 시 운영자에게 best-effort 운영 알림(push)을 발송한다.
 *
 * <p>{@link CompensationAuditWriter} 가 감사 행 저장에 성공한 뒤 호출한다. 알림은 보조 신호일 뿐이므로
 * 발송 실패가 보상 감사/전표 흐름에 절대 영향을 주지 않도록 모든 예외를 삼킨다(WARN 로그만).
 *
 * <p>기본 비활성이며, 운영 환경에서 {@code samhan.compensation.alert.enabled=true} 와
 * {@code recipient-user-id} 를 함께 지정한 경우에만 발송한다. (D-SER-26)
 *
 * <p>알림 본문은 사용자 비공개 UUID 대신 비즈니스 식별자(slipNo·품목코드)만 노출한다.
 */
@Slf4j
@Component
public class CompensationAlertNotifier {

    private static final int MAX_BODY_LENGTH = 2000;

    private final NotificationClient notificationClient;
    private final boolean enabled;
    private final String recipientUserId;

    public CompensationAlertNotifier(
            NotificationClient notificationClient,
            @Value("${samhan.compensation.alert.enabled:false}") boolean enabled,
            @Value("${samhan.compensation.alert.recipient-user-id:}") String recipientUserId) {
        this.notificationClient = notificationClient;
        this.enabled = enabled;
        this.recipientUserId = recipientUserId;
    }

    /**
     * 보상 실패 1건을 운영 알림으로 발송한다(best-effort).
     *
     * @param slip 원본 전표
     * @param phase 보상 단계
     * @param productCode 품목 코드
     * @param operation 실패한 보상 동작
     * @param failureReason 보상 실패 원인 요약
     * @param originalFailureReason 보상을 촉발한 원본 실패 원인 요약
     */
    public void notifyFailure(Slip slip, CompensationPhase phase, String productCode,
                              CompensationOperation operation, String failureReason,
                              String originalFailureReason) {
        if (!enabled) {
            return;
        }
        UUID recipient = resolveRecipient();
        if (recipient == null) {
            // 활성화했으나 수신자 미지정 — 설정 오류이므로 1회 경고로 표면화한다.
            log.warn("[CompensationAlertNotifier] alert.enabled=true 이나 recipient-user-id 미설정 — 운영 알림 skip");
            return;
        }
        try {
            String subject = String.format("[보상실패] %s", slip.getSlipNo());
            String body = buildBody(slip, phase, productCode, operation,
                    failureReason, originalFailureReason);
            notificationClient.sendUserPush(recipient, subject, body);
        } catch (RuntimeException ex) {
            // 알림은 보조 신호 — 어떤 실패도 보상 흐름에 전파하지 않는다.
            log.warn("[CompensationAlertNotifier] 운영 알림 발송 실패(graceful) — slipNo={} msg={}",
                    slip.getSlipNo(), ex.getMessage());
        }
    }

    private UUID resolveRecipient() {
        if (recipientUserId == null || recipientUserId.isBlank()) {
            return null;
        }
        try {
            return UUID.fromString(recipientUserId.trim());
        } catch (IllegalArgumentException ex) {
            log.warn("[CompensationAlertNotifier] recipient-user-id 형식 오류 — 운영 알림 skip");
            return null;
        }
    }

    private String buildBody(Slip slip, CompensationPhase phase, String productCode,
                             CompensationOperation operation, String failureReason,
                             String originalFailureReason) {
        String body = String.format(
                "재고 보상 실패가 발생했습니다. 수동 정합이 필요합니다.%n"
                        + "전표번호: %s%n전표유형: %s%n단계: %s%n품목코드: %s%n동작: %s%n"
                        + "실패원인: %s%n원본원인: %s",
                slip.getSlipNo(), slip.getSlipType(), phase, productCode, operation,
                failureReason, originalFailureReason);
        return body.length() > MAX_BODY_LENGTH ? body.substring(0, MAX_BODY_LENGTH) : body;
    }
}
