package com.samhanair.logis.slip.collab;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

class SlipCoeditServiceTest {

    private static final UUID SLIP_ID = UUID.fromString("10000000-0000-0000-0000-000000000001");

    private final RealtimeBroker broker = Mockito.mock(RealtimeBroker.class);
    private final SlipCoeditService service = new SlipCoeditService(broker);

    @Test
    void appendUpdate_stores_opaque_base64_and_publishes_update_event() {
        String update = "AQIDBA==";

        service.appendUpdate(SLIP_ID, update);

        assertThat(service.listUpdates(SLIP_ID)).containsExactly(update);
        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(broker).publish(eq(SLIP_ID), eq(SlipCoeditService.EVENT_UPDATE), payloadCaptor.capture());
        assertThat(payloadCaptor.getValue()).containsEntry("update", update);
    }

    @Test
    void publishAwareness_does_not_store_ephemeral_payload() {
        String awareness = "BQYH";

        service.publishAwareness(SLIP_ID, awareness);

        assertThat(service.listUpdates(SLIP_ID)).isEmpty();
        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(broker).publish(eq(SLIP_ID), eq(SlipCoeditService.EVENT_AWARENESS), payloadCaptor.capture());
        assertThat(payloadCaptor.getValue()).containsEntry("awareness", awareness);
    }

    @Test
    void blank_or_invalid_base64_is_rejected() {
        assertThatThrownBy(() -> service.appendUpdate(SLIP_ID, " "))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.publishAwareness(SLIP_ID, "not-base64!"))
                .isInstanceOf(BusinessException.class);
    }
}
