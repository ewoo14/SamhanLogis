package com.samhanair.logis.collab.coedit;

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

class CollabCoeditServiceTest {

    private static final UUID DOCUMENT_ID = UUID.fromString("10000000-0000-0000-0000-000000000001");

    private final RealtimeBroker broker = Mockito.mock(RealtimeBroker.class);
    private final CollabCoeditService service = new CollabCoeditService(broker);

    @Test
    void appendUpdate_stores_updates_in_order_for_replay() {
        service.appendUpdate(DOCUMENT_ID, "AQID");
        service.appendUpdate(DOCUMENT_ID, "BAUG");

        assertThat(service.listUpdates(DOCUMENT_ID)).containsExactly("AQID", "BAUG");
    }

    @Test
    void publishAwareness_replays_nothing_but_publishes_awareness_event() {
        String awareness = "BQYH";

        service.publishAwareness(DOCUMENT_ID, awareness);

        assertThat(service.listUpdates(DOCUMENT_ID)).isEmpty();
        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(broker).publish(eq(DOCUMENT_ID), eq(CollabCoeditService.EVENT_AWARENESS), payloadCaptor.capture());
        assertThat(payloadCaptor.getValue()).containsEntry("awareness", awareness);
    }

    @Test
    void appendUpdate_relays_opaque_payload_verbatim() {
        String update = " AQIDBA== ";

        service.appendUpdate(DOCUMENT_ID, update);

        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(broker).publish(eq(DOCUMENT_ID), eq(CollabCoeditService.EVENT_UPDATE), payloadCaptor.capture());
        assertThat(payloadCaptor.getValue()).containsEntry("update", "AQIDBA==");
    }

    @Test
    void appendUpdate_broadcasts_arbitrary_valid_base64() {
        String update = "BQYH";

        service.appendUpdate(DOCUMENT_ID, update);

        ArgumentCaptor<Map<String, Object>> payloadCaptor = ArgumentCaptor.forClass(Map.class);
        verify(broker).publish(eq(DOCUMENT_ID), eq(CollabCoeditService.EVENT_UPDATE), payloadCaptor.capture());
        assertThat(payloadCaptor.getValue()).containsEntry("update", update);
        assertThat(service.listUpdates(DOCUMENT_ID)).containsExactly(update);
    }

    @Test
    void oversized_payload_is_rejected_without_snapshot_mutation() {
        String huge = "A".repeat(CollabCoeditService.MAX_PAYLOAD_LENGTH + 4);

        assertThatThrownBy(() -> service.appendUpdate(DOCUMENT_ID, huge))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.publishAwareness(DOCUMENT_ID, huge))
                .isInstanceOf(BusinessException.class);
        assertThat(service.listUpdates(DOCUMENT_ID)).isEmpty();
    }

    @Test
    void cumulative_cap_rejects_append_without_dropping_existing_prefix() {
        String oldest = Base64.getEncoder().encodeToString("oldest".getBytes(StandardCharsets.UTF_8));
        service.appendUpdate(DOCUMENT_ID, oldest);

        for (int i = 0; i < 5_000; i++) {
            String next = Base64.getEncoder().encodeToString(("u" + i).getBytes(StandardCharsets.UTF_8));
            if (i < 4_999) {
                service.appendUpdate(DOCUMENT_ID, next);
            } else {
                assertThatThrownBy(() -> service.appendUpdate(DOCUMENT_ID, next))
                        .isInstanceOf(BusinessException.class);
            }
        }

        assertThat(service.listUpdates(DOCUMENT_ID)).hasSize(5_000);
        assertThat(service.listUpdates(DOCUMENT_ID)).contains(oldest);
    }

    @Test
    void cumulative_byte_cap_rejects_append_before_count_cap() {
        // 단건 최대 길이(MAX_PAYLOAD_LENGTH) update 8건이면 누적 1MB(MAX_TOTAL_PAYLOAD_LENGTH_PER_DOCUMENT) 정확 도달.
        // 9번째는 byte 누적 한도 초과로 거부 — 건수 cap(5000) 훨씬 이전 차단(삭제된 SlipCoeditServiceTest byte-cap 커버 복원).
        String maxUpdate = "A".repeat(CollabCoeditService.MAX_PAYLOAD_LENGTH); // "AAAA..." = 유효 base64(zero bytes)
        for (int i = 0; i < 8; i++) {
            service.appendUpdate(DOCUMENT_ID, maxUpdate);
        }
        assertThatThrownBy(() -> service.appendUpdate(DOCUMENT_ID, maxUpdate))
                .isInstanceOf(BusinessException.class);
        // 기존 prefix 미삭제(신규 접속자 snapshot 계약 보존)
        assertThat(service.listUpdates(DOCUMENT_ID)).hasSize(8);
    }

    @Test
    void blank_or_invalid_base64_is_rejected_without_relay() {
        assertThatThrownBy(() -> service.appendUpdate(DOCUMENT_ID, "   "))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.appendUpdate(DOCUMENT_ID, "not-base64!"))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.publishAwareness(DOCUMENT_ID, "   "))
                .isInstanceOf(BusinessException.class);
        assertThat(service.listUpdates(DOCUMENT_ID)).isEmpty();
    }
}
