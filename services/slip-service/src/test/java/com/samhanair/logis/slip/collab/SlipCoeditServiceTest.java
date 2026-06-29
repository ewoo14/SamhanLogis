package com.samhanair.logis.slip.collab;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
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

    @Test
    void oversized_payload_is_rejected() {
        // 128KB(MAX_PAYLOAD_LENGTH) 초과 base64 는 거부 — 메모리/대역폭 DoS 방지(리뷰 BE B-1).
        String huge = "A".repeat(128 * 1024 + 4);
        assertThatThrownBy(() -> service.appendUpdate(SLIP_ID, huge))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.publishAwareness(SLIP_ID, huge))
                .isInstanceOf(BusinessException.class);
        assertThat(service.listUpdates(SLIP_ID)).isEmpty();
    }

    @Test
    void appendUpdate_caps_accumulated_updates_and_evicts_oldest() {
        // MAX_UPDATES_PER_SLIP(5000) 초과 시 oldest eviction — 누적 무한 증가 방지(리뷰 BE N-4).
        String oldest = Base64.getEncoder().encodeToString("oldest".getBytes(StandardCharsets.UTF_8));
        service.appendUpdate(SLIP_ID, oldest);
        for (int i = 0; i < 5_000; i++) {
            service.appendUpdate(
                    SLIP_ID,
                    Base64.getEncoder().encodeToString(("u" + i).getBytes(StandardCharsets.UTF_8)));
        }
        assertThat(service.listUpdates(SLIP_ID)).hasSize(5_000);
        assertThat(service.listUpdates(SLIP_ID)).doesNotContain(oldest);
    }
}
