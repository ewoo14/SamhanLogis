package com.samhanair.logis.inventory.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.inventory.realtime.domain.InventoryAuditLog;
import com.samhanair.logis.inventory.realtime.repository.InventoryAuditLogRepository;
import com.samhanair.logis.inventory.realtime.service.InventoryAuditLogRecorder;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * PR-H4b — InventoryAuditLogRecorder 단위 테스트.
 */
@ExtendWith(MockitoExtension.class)
class InventoryAuditLogRecorderTest {

    @Mock
    private InventoryAuditLogRepository auditLogRepository;

    @Mock
    private RealtimeBroker broker;

    @InjectMocks
    private InventoryAuditLogRecorder recorder;

    private UUID entityId;
    private UUID actorId;

    @BeforeEach
    void setUp() {
        entityId = UUID.randomUUID();
        actorId = UUID.randomUUID();
        lenient().when(auditLogRepository.save(any(InventoryAuditLog.class)))
                .thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void recordOverlayPatch_singleField_savesAndPublishesSseEvent() {
        when(auditLogRepository.countByEntityId(entityId)).thenReturn(0L);

        recorder.recordOverlayPatch(entityId, actorId, "홍길동", null, "status", "PLANNED", "IN_PROGRESS");

        verify(auditLogRepository, times(1)).save(any(InventoryAuditLog.class));
        verify(broker).publish(eq(entityId),
                eq(InventoryAuditLogRecorder.EVENT_INVENTORY_EDIT), any());
    }

    @Test
    void recordBatch_multipleFields_shareSameRevisionNo() {
        when(auditLogRepository.countByEntityId(entityId)).thenReturn(2L);

        List<ChangeEntry> changes = List.of(
                new ChangeEntry("auditDate", "2026-12-30", "2026-12-31"),
                new ChangeEntry("status", "PLANNED", "IN_PROGRESS"));

        List<InventoryAuditLog> saved = recorder.recordBatch(entityId, actorId, "홍길동", "#3B82F6", changes);

        assertThat(saved).hasSize(2);
        assertThat(saved).allMatch(r -> r.getRevisionNo() == 3); // count(2) + 1
        verify(auditLogRepository, times(2)).save(any(InventoryAuditLog.class));
        verify(broker, times(1)).publish(eq(entityId), anyString(), any());
    }

    @Test
    void recordBatch_emptyChanges_throwsBusinessException() {
        assertThatThrownBy(() -> recorder.recordBatch(entityId, actorId, "홍길동", null, List.of()))
                .isInstanceOf(BusinessException.class);
        verify(auditLogRepository, never()).save(any());
        verify(broker, never()).publish(any(), anyString(), any());
    }

    @Test
    void listByEntity_returnsRepositoryResult() {
        when(auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(entityId))
                .thenReturn(List.of());
        assertThat(recorder.listByEntity(entityId)).isEmpty();
        verify(auditLogRepository).findByEntityIdOrderByRevisionNoDescChangedAtDesc(entityId);
    }

    @Test
    void recordBatch_publishesPayloadContainsActorAndChanges() {
        when(auditLogRepository.countByEntityId(entityId)).thenReturn(0L);
        ArgumentCaptor<Object> payloadCaptor = ArgumentCaptor.forClass(Object.class);

        recorder.recordBatch(entityId, actorId, "테스트", null,
                List.of(new ChangeEntry("status", "A", "B")));

        verify(broker).publish(eq(entityId),
                eq(InventoryAuditLogRecorder.EVENT_INVENTORY_EDIT), payloadCaptor.capture());
        assertThat(payloadCaptor.getValue()).isNotNull();

        // revisionNo 채번 검증
        ArgumentCaptor<InventoryAuditLog> rowCaptor = ArgumentCaptor.forClass(InventoryAuditLog.class);
        verify(auditLogRepository).save(rowCaptor.capture());
        assertThat(rowCaptor.getValue().getRevisionNo()).isEqualTo(1);
        assertThat(rowCaptor.getValue().getActorName()).isEqualTo("테스트");
    }

    @Test
    void recordBatch_uuidActorName_isNotPersistedWhileActorIdRemains() {
        when(auditLogRepository.countByEntityId(entityId)).thenReturn(0L);
        ArgumentCaptor<InventoryAuditLog> rowCaptor = ArgumentCaptor.forClass(InventoryAuditLog.class);

        recorder.recordBatch(entityId, actorId, actorId.toString(), null,
                List.of(new ChangeEntry("status", "A", "B")));

        verify(auditLogRepository).save(rowCaptor.capture());
        assertThat(rowCaptor.getValue().getActorId()).isEqualTo(actorId);
        assertThat(rowCaptor.getValue().getActorName()).isEqualTo("변경자 미상");
    }

    @Test
    void recordOverlayPatch_savesViaBatch_singleEntry() {
        when(auditLogRepository.countByEntityId(entityId)).thenReturn(5L);
        ArgumentCaptor<InventoryAuditLog> rowCaptor = ArgumentCaptor.forClass(InventoryAuditLog.class);

        recorder.recordOverlayPatch(entityId, actorId, "홍길동", "#FF0000", "memo", "old", "new");

        verify(auditLogRepository).save(rowCaptor.capture());
        InventoryAuditLog saved = rowCaptor.getValue();
        assertThat(saved.getRevisionNo()).isEqualTo(6);
        assertThat(saved.getFieldName()).isEqualTo("memo");
        assertThat(saved.getOldValue()).isEqualTo("old");
        assertThat(saved.getNewValue()).isEqualTo("new");
        assertThat(saved.getActorColor()).isEqualTo("#FF0000");
    }

    /** revision_no 단조 채번 — countByEntityId() 일관성 검증. */
    @Test
    void recordBatch_revisionNo_isCountPlusOne() {
        when(auditLogRepository.countByEntityId(entityId)).thenReturn(7L);
        ArgumentCaptor<InventoryAuditLog> rowCaptor = ArgumentCaptor.forClass(InventoryAuditLog.class);

        recorder.recordBatch(entityId, actorId, "test", null,
                List.of(new ChangeEntry("f1", null, "v1"),
                        new ChangeEntry("f2", "old", "new")));

        verify(auditLogRepository, times(2)).save(rowCaptor.capture());
        List<InventoryAuditLog> rows = rowCaptor.getAllValues();
        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).getRevisionNo()).isEqualTo(8);
        assertThat(rows.get(1).getRevisionNo()).isEqualTo(8);
    }

    /** field 외 필드값 검증 — actorId/actorName, fieldName 길이 한계. */
    @Test
    void recordBatch_fieldNameOver50Chars_throwsFromAuditLogEntryInit() {
        when(auditLogRepository.countByEntityId(entityId)).thenReturn(0L);
        String longField = "a".repeat(60);
        assertThatThrownBy(() -> recorder.recordBatch(entityId, actorId, "x", null,
                List.of(new ChangeEntry(longField, null, "v"))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void recordBatch_bothOldAndNewNull_throwsFromAuditLogEntryInit() {
        when(auditLogRepository.countByEntityId(entityId)).thenReturn(0L);
        assertThatThrownBy(() -> recorder.recordBatch(entityId, actorId, "x", null,
                List.of(new ChangeEntry("f", null, null))))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
