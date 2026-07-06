package com.samhanair.logis.slip.audit.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.samhanair.logis.slip.audit.domain.SlipAuditLog;
import com.samhanair.logis.slip.audit.repository.SlipAuditLogRepository;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService.ChangeEntry;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.realtime.SlipRealtimeBroker;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * PR-H2 BE — TM 보완 #2: SSE event payload 형식 정확성 검증 (2 case).
 *
 * <p>Mockito ArgumentCaptor 로 broker.publish 호출 시 payload 캡처 + JSON schema 일관성 assertion.
 *
 * <ol>
 *   <li>recordOverlayPatch payload schema — revisionNo / actorId / actorName / actorColor /
 *       changes 5 키 + changes[0] 의 fieldName/oldValue/newValue 3 키</li>
 *   <li>recordBatch payload — 다중 changes 가 같은 순서로 직렬화</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class SlipAuditPayloadCaptorTest {

    @Mock private SlipAuditLogRepository auditLogRepository;
    @Mock private SlipRepository slipRepository;
    @Mock private SlipRealtimeBroker broker;

    @InjectMocks private SlipAuditLogService service;

    private UUID slipId;
    private UUID actorId;
    private Slip slip;

    @BeforeEach
    void setUp() {
        slipId = UUID.randomUUID();
        actorId = UUID.randomUUID();
        slip = Slip.createOutbound("2026/05/10-001", LocalDate.now(), 1,
                UUID.randomUUID(), null, null, "거래처A", null, "원본", "user-1");
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(auditLogRepository.save(any(SlipAuditLog.class))).thenAnswer(inv -> {
            SlipAuditLog log = inv.getArgument(0);
            ReflectionTestUtils.setField(log, "id", UUID.randomUUID());
            return log;
        });
    }

    @Test
    @SuppressWarnings("unchecked")
    void recordOverlayPatch_payloadSchema_hasAll5KeysAndSingleChange() {
        service.recordOverlayPatch(slipId, actorId, "홍길동", "#3B82F6",
                "memo", "원본", "수정");

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        org.mockito.Mockito.verify(broker).publish(eq(slipId),
                eq(SlipAuditLogService.EVENT_SLIP_EDIT), captor.capture());

        Map<String, Object> payload = captor.getValue();
        assertThat(payload).containsKeys("revisionNo", "actorId", "actorName", "actorColor", "changes");
        assertThat(payload.get("revisionNo")).isEqualTo(1);
        assertThat(payload.get("actorId")).isEqualTo(actorId.toString());
        assertThat(payload.get("actorName")).isEqualTo("홍길동");
        assertThat(payload.get("actorColor")).isEqualTo("#3B82F6");

        List<Map<String, Object>> changes = (List<Map<String, Object>>) payload.get("changes");
        assertThat(changes).hasSize(1);
        assertThat(changes.get(0)).containsKeys("fieldName", "oldValue", "newValue");
        assertThat(changes.get(0).get("fieldName")).isEqualTo("memo");
        assertThat(changes.get(0).get("oldValue")).isEqualTo("원본");
        assertThat(changes.get(0).get("newValue")).isEqualTo("수정");
    }

    @Test
    @SuppressWarnings("unchecked")
    void recordBatch_payload_preservesChangesOrder() {
        List<ChangeEntry> changes = List.of(
                new ChangeEntry("memo", "old1", "new1"),
                new ChangeEntry("shippingAddress", null, "주소"),
                new ChangeEntry("receiverPhone", "010-1111-2222", "010-3333-4444"));
        service.recordBatch(slipId, actorId, "관리자김", null, changes);

        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        org.mockito.Mockito.verify(broker).publish(eq(slipId),
                eq(SlipAuditLogService.EVENT_SLIP_EDIT), captor.capture());

        Map<String, Object> payload = captor.getValue();
        List<Map<String, Object>> emitted = (List<Map<String, Object>>) payload.get("changes");
        assertThat(emitted).hasSize(3);
        assertThat(emitted.get(0).get("fieldName")).isEqualTo("memo");
        assertThat(emitted.get(1).get("fieldName")).isEqualTo("shippingAddress");
        assertThat(emitted.get(2).get("fieldName")).isEqualTo("receiverPhone");
    }
}
