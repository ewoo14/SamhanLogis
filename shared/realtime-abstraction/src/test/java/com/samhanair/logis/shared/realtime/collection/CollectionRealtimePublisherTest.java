package com.samhanair.logis.shared.realtime.collection;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.shared.realtime.broker.InMemoryRealtimeBroker;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class CollectionRealtimePublisherTest {

    private static final UUID CHANNEL = UUID.fromString("00000000-0000-0000-0000-0000000000AA");

    @Test
    void 트랜잭션_없으면_즉시_발화() {
        RealtimeBroker broker = new InMemoryRealtimeBroker();
        CollectionRealtimePublisher publisher = new CollectionRealtimePublisher(broker);

        publisher.publishChange(CHANNEL, "dispatch:board:changed", Map.of("changeType", "CREATED"));

        assertThat(broker.publishCount()).isEqualTo(1L);
    }

    @Test
    void 활성_트랜잭션이면_afterCommit_등록_커밋전_미발화() {
        RealtimeBroker broker = new InMemoryRealtimeBroker();
        CollectionRealtimePublisher publisher = new CollectionRealtimePublisher(broker);

        TransactionSynchronizationManager.initSynchronization();
        try {
            publisher.publishChange(CHANNEL, "dispatch:board:changed", Map.of("changeType", "UPDATED"));
            // 커밋 전 - 아직 미발화
            assertThat(broker.publishCount()).isZero();
            // afterCommit 콜백 수동 트리거 (커밋 시뮬레이션)
            TransactionSynchronizationManager.getSynchronizations().forEach(s -> s.afterCommit());
            assertThat(broker.publishCount()).isEqualTo(1L);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }
}
