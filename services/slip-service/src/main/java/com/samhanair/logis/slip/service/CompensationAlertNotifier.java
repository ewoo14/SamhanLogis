package com.samhanair.logis.slip.service;

import com.samhanair.logis.slip.client.NotificationClient;
import com.samhanair.logis.slip.domain.CompensationOperation;
import com.samhanair.logis.slip.domain.CompensationPhase;
import com.samhanair.logis.slip.domain.Slip;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

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
    private final CompensationMetrics compensationMetrics;

    public CompensationAlertNotifier(
            NotificationClient notificationClient,
            @Value("${samhan.compensation.alert.enabled:false}") boolean enabled,
            @Value("${samhan.compensation.alert.recipient-user-id:}") String recipientUserId,
            CompensationMetrics compensationMetrics) {
        this.notificationClient = notificationClient;
        this.enabled = enabled;
        this.recipientUserId = recipientUserId;
        this.compensationMetrics = compensationMetrics;
    }

    /**
     * 보상 실패 1건을 운영 알림으로 발송한다(best-effort).
     *
     * <p>알림 본문은 비즈니스 식별자(slipNo·품목코드 등)만 담는다. 원인 예외 메시지에는 내부 UUID
     * (warehouse/user/slip)가 섞일 수 있어 사용자-visible 푸시에 절대 싣지 않는다. 상세 원인은
     * 보상 감사 행/WARN 로그에 slipNo 로 남으므로 운영자는 거기서 조회한다. (Codex cross-check P1 — UUID 유출 방지)
     *
     * @param slip 원본 전표
     * @param phase 보상 단계
     * @param productCode 품목 코드
     * @param operation 실패한 보상 동작
     */
    public void notifyFailure(Slip slip, CompensationPhase phase, String productCode,
                              CompensationOperation operation) {
        if (!enabled) {
            compensationMetrics.recordAlertSendSkipped();
            return;
        }
        UUID recipient = resolveRecipient();
        if (recipient == null) {
            compensationMetrics.recordAlertSendSkipped();
            return;
        }
        String slipNo = slip.getSlipNo();
        String subject = String.format("[보상실패] %s", slipNo);
        String body = buildBody(slip, phase, productCode, operation);
        // 호출 컨텍스트가 트랜잭션(감사 record() 의 REQUIRES_NEW) 안이면 커밋 완료 후 발송한다.
        // 이유: (1) 감사 행이 롤백되면 알림도 발송하지 않아 알림-DB 일관성 유지,
        //       (2) notification HTTP I/O(최대 5s)가 DB 커넥션 점유 시간에 포함되지 않게 함. (리뷰 BE/DevOps P1)
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send(recipient, subject, body, slipNo);
                }
            });
        } else {
            send(recipient, subject, body, slipNo);
        }
    }

    private void send(UUID recipient, String subject, String body, String slipNo) {
        try {
            notificationClient.sendUserPush(recipient, subject, body);
            compensationMetrics.recordAlertSendSuccess();
        } catch (Exception ex) {
            // 알림은 보조 신호 — 어떤 예외(checked 포함)도 보상 흐름에 전파하지 않는다.
            log.warn("[CompensationAlertNotifier] 운영 알림 발송 실패(graceful) — slipNo={} msg={}",
                    slipNo, ex.getMessage());
            compensationMetrics.recordAlertSendFailure();
        }
    }

    private UUID resolveRecipient() {
        if (recipientUserId == null || recipientUserId.isBlank()) {
            log.warn("[CompensationAlertNotifier] alert.enabled=true 이나 recipient-user-id 미설정 — 운영 알림 skip");
            return null;
        }
        String normalized = recipientUserId.trim();
        try {
            return UUID.fromString(normalized);
        } catch (IllegalArgumentException ex) {
            log.warn("[CompensationAlertNotifier] recipient-user-id 형식 오류(UUID 아님) — 운영 알림 skip, length={}",
                    normalized.length());
            return null;
        }
    }

    private String buildBody(Slip slip, CompensationPhase phase, String productCode,
                             CompensationOperation operation) {
        // 예외 메시지(내부 UUID 포함 가능)는 본문에서 제외 — 상세 원인은 감사 행/로그에서 slipNo 로 조회.
        String body = String.format(
                "재고 보상 실패가 발생했습니다. 수동 정합이 필요합니다.%n"
                        + "전표번호: %s%n전표유형: %s%n단계: %s%n품목코드: %s%n동작: %s%n"
                        + "상세 원인은 보상 감사 로그/복구 화면에서 전표번호로 확인하세요.",
                slip.getSlipNo(), slip.getSlipType(), phase, productCode, operation);
        return body.length() > MAX_BODY_LENGTH ? body.substring(0, MAX_BODY_LENGTH) : body;
    }
}
