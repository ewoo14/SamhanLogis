package com.samhanair.logis.partnerorder.realtime;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;

/**
 * 거래처 주문의 서버 권위 커밋을 per-order SSE로 알리는 단일 발행 게이트.
 *
 * <p>사건은 문서 내용을 포함하지 않고 커밋 identity와 변경 종류만 전달한다. 기존
 * {@code /realtime}와 {@code /collab/stream}은 같은 브로커를 사용하므로 양쪽 소비자가
 * 동일한 {@link #EVENT_NAME}을 받으며, 기존 이벤트는 그대로 유지된다.
 */
@Slf4j
@Component
public class PartnerOrderAuthorityEventPublisher {

    public static final String EVENT_NAME = "partner-order:authority";

    private final RealtimeBroker broker;

    public PartnerOrderAuthorityEventPublisher(RealtimeBroker broker) {
        this.broker = broker;
    }

    /** 권위 쓰기 성공 뒤 호출한다. 트랜잭션 중이면 commit 이후에 한 번 발행한다. */
    public UUID publish(UUID orderId, String changeType, Integer revisionNo) {
        UUID commitId = UUID.randomUUID();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("commitId", commitId);
        payload.put("orderId", orderId);
        payload.put("revisionNo", revisionNo);
        payload.put("changeType", changeType);
        Runnable send = () -> publishBestEffort(orderId, payload);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    send.run();
                }
            });
        } else {
            send.run();
        }
        return commitId;
    }

    private void publishBestEffort(UUID orderId, Map<String, Object> payload) {
        try {
            broker.publish(orderId, EVENT_NAME, payload);
        } catch (RuntimeException ex) {
            log.warn("권위 사건 발행 실패 — commitId={}, orderId={}, cause={}",
                    payload.get("commitId"), orderId, ex.getMessage());
        }
    }
}
