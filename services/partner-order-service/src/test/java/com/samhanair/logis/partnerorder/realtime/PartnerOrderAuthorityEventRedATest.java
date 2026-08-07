package com.samhanair.logis.partnerorder.realtime;

import static org.assertj.core.api.Assertions.assertThat;

import com.samhanair.logis.shared.realtime.broker.InMemoryRealtimeBroker;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * RED-A 통합 게이트: authority publisher → 실제 in-memory broker → 실제 SseEmitter 경로를 검증한다.
 * 각 권위 경로가 사용하는 사건 유형을 한 번씩 흘려 보내고 snapshot 부재와 commit identity를 확인한다.
 */
class PartnerOrderAuthorityEventRedATest {

    @Test
    void six_authority_paths_publish_exactly_once_to_a_real_sse_emitter() {
        UUID orderId = UUID.randomUUID();
        CapturingBroker broker = new CapturingBroker();
        SseEmitter emitter = broker.subscribe(orderId);
        PartnerOrderAuthorityEventPublisher publisher = new PartnerOrderAuthorityEventPublisher(broker);

        List<String> authorityPaths = List.of(
                "REVISION", "CONVERT", "RESTORED", "STATUS", "MERGE_CONVERT", "OUTBOX_COMMITTED");
        for (String path : authorityPaths) {
            publisher.publish(orderId, path, null);
        }

        assertThat(emitter).isNotNull();
        assertThat(broker.subscriberCount(orderId)).isEqualTo(1);
        assertThat(broker.publishCount()).isEqualTo(authorityPaths.size());
        assertThat(broker.events).hasSize(authorityPaths.size());
        assertThat(broker.events.stream().map(event -> event.eventName()).distinct())
                .containsExactly(PartnerOrderAuthorityEventPublisher.EVENT_NAME);
        assertThat(broker.events.stream().map(event -> event.payload().get("changeType")))
                .containsExactlyElementsOf(authorityPaths);
        assertThat(broker.events.stream().map(event -> event.payload().get("commitId")).distinct())
                .hasSize(authorityPaths.size());
        assertThat(broker.events).allSatisfy(event -> {
            assertThat(event.payload()).containsKeys("commitId", "orderId", "revisionNo", "changeType");
            assertThat(event.payload()).doesNotContainKeys("snapshot", "document", "yDoc");
        });
    }

    private static final class CapturingBroker implements RealtimeBroker {
        private final InMemoryRealtimeBroker delegate = new InMemoryRealtimeBroker();
        private final List<Event> events = new ArrayList<>();

        @Override
        public SseEmitter subscribe(UUID entityId) { return delegate.subscribe(entityId); }

        @Override
        @SuppressWarnings("unchecked")
        public void publish(UUID entityId, String eventName, Object payload) {
            events.add(new Event(eventName, (Map<String, Object>) payload));
            delegate.publish(entityId, eventName, payload);
        }

        @Override public void publishLocal(UUID entityId, String eventName, Object payload) {
            delegate.publishLocal(entityId, eventName, payload);
        }
        @Override public void heartbeat() { delegate.heartbeat(); }
        @Override public int subscriberCount(UUID entityId) { return delegate.subscriberCount(entityId); }
        @Override public long publishCount() { return delegate.publishCount(); }
        @Override public long publishFailureCount() { return delegate.publishFailureCount(); }
        @Override public long heartbeatCount() { return delegate.heartbeatCount(); }

        private record Event(String eventName, Map<String, Object> payload) {}
    }
}
