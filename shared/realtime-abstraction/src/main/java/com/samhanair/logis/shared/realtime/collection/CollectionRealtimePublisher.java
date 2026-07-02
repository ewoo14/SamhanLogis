package com.samhanair.logis.shared.realtime.collection;

import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.util.Map;
import java.util.UUID;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 컬렉션(목록) 레벨 변경 SSE 발화 통일 게이트웨이 (E2 기둥1 공유 헬퍼).
 *
 * <p>product 카탈로그의 {@code ProductCatalogChangePublisher} afterCommit 패턴을 도메인 무관
 * 재사용 형태로 일반화. 각 도메인은 well-known 합성 채널 UUID + 이벤트명을 넘겨 목록 변경을
 * 브로드캐스트한다. 페이로드는 opaque 최소값(변경 종류/식별자) — FE 는 상세를 refetch 한다.
 *
 * <p><b>발화 시점</b>: 활성 트랜잭션이면 {@link TransactionSynchronization#afterCommit()} 지연
 * (롤백 시 미발화), 없으면 즉시(fallback). "생성/수정/삭제가 커밋된 뒤에만 타 화면 반영".
 */
public class CollectionRealtimePublisher {

    private final RealtimeBroker broker;

    public CollectionRealtimePublisher(RealtimeBroker broker) {
        this.broker = broker;
    }

    /**
     * 컬렉션 변경 publish (커밋 후 발화).
     *
     * @param channelId 도메인 컬렉션 채널 (well-known 합성 UUID)
     * @param eventName SSE event name (예: "dispatch:board:changed")
     * @param payload opaque 최소 페이로드 (예: {@code {"changeType":"CREATED"}})
     */
    public void publishChange(UUID channelId, String eventName, Map<String, Object> payload) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    broker.publish(channelId, eventName, payload);
                }
            });
        } else {
            broker.publish(channelId, eventName, payload);
        }
    }
}
