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
    void appendUpdate_rejects_when_update_count_limit_would_break_snapshot_contract() {
        // MAX_UPDATES_PER_SLIP(5000) 초과 시 oldest 를 삭제하지 않고 거부한다 — Yjs prefix log 보존.
        String oldest = Base64.getEncoder().encodeToString("oldest".getBytes(StandardCharsets.UTF_8));
        service.appendUpdate(SLIP_ID, oldest);
        for (int i = 0; i < 5_000; i++) {
            String next = Base64.getEncoder().encodeToString(("u" + i).getBytes(StandardCharsets.UTF_8));
            if (i < 4_999) {
                service.appendUpdate(SLIP_ID, next);
            } else {
                assertThatThrownBy(() -> service.appendUpdate(SLIP_ID, next))
                        .isInstanceOf(BusinessException.class);
            }
        }
        assertThat(service.listUpdates(SLIP_ID)).hasSize(5_000);
        assertThat(service.listUpdates(SLIP_ID)).contains(oldest);
    }

    @Test
    void appendUpdate_rejects_when_payload_byte_limit_would_break_snapshot_contract() {
        String chunk = "A".repeat(128 * 1024);

        for (int i = 0; i < 9; i++) {
            if (i < 8) {
                service.appendUpdate(SLIP_ID, chunk);
            } else {
                assertThatThrownBy(() -> service.appendUpdate(SLIP_ID, chunk))
                        .isInstanceOf(BusinessException.class);
            }
        }

        assertThat(service.listUpdates(SLIP_ID)).hasSize(8);
        assertThat(service.listUpdates(SLIP_ID).stream().mapToInt(String::length).sum())
                .isLessThanOrEqualTo(1024 * 1024);
    }
}
