package com.samhanair.logis.partnerorder.realtime;

import com.samhanair.logis.shared.realtime.collection.CollectionRealtimePublisher;
import java.util.Map;
import org.springframework.stereotype.Component;

/** 거래처 주문 목록 변경 after-commit 발화 헬퍼. */
@Component
public class PartnerOrderBoardChangePublisher {

    private final CollectionRealtimePublisher collectionPublisher;

    public PartnerOrderBoardChangePublisher(CollectionRealtimePublisher collectionPublisher) {
        this.collectionPublisher = collectionPublisher;
    }

    /**
     * 거래처 주문 목록 변경을 발화한다.
     *
     * @param changeType CREATED / UPDATED / DELETED / RESTORED
     */
    public void publishListChanged(String changeType) {
        collectionPublisher.publishChange(
                PartnerOrderBoardRealtime.CHANNEL_ID,
                PartnerOrderBoardRealtime.EVENT_CHANGED,
                Map.of("changeType", changeType));
    }
}
