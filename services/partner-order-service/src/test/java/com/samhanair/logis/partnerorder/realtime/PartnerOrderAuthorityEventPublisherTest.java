package com.samhanair.logis.partnerorder.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.eq;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PartnerOrderAuthorityEventPublisherTest {

    @Mock
    private RealtimeBroker broker;

    @Test
    void publishes_snapshot_free_event_with_unique_commit_identity() {
        PartnerOrderAuthorityEventPublisher publisher = new PartnerOrderAuthorityEventPublisher(broker);
        UUID orderId = UUID.randomUUID();

        publisher.publish(orderId, "EDIT", 7);

        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(broker).publish(eq(orderId), eq(PartnerOrderAuthorityEventPublisher.EVENT_NAME), payload.capture());
        assertThat(payload.getValue()).isInstanceOf(Map.class);
        Map<String, Object> event = (Map<String, Object>) payload.getValue();
        assertThat(event).containsKeys("commitId", "orderId", "revisionNo", "changeType");
        assertThat(event.get("commitId")).isInstanceOf(UUID.class);
        assertThat(event).doesNotContainKey("snapshot");
        assertThat(event).doesNotContainKey("document");
    }

    @Test
    void publication_failure_does_not_escape_authority_commit_path() {
        PartnerOrderAuthorityEventPublisher publisher = new PartnerOrderAuthorityEventPublisher(broker);
        doThrow(new RuntimeException("broker down")).when(broker)
                .publish(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.any());

        publisher.publish(UUID.randomUUID(), "STATUS", null);
    }
}
