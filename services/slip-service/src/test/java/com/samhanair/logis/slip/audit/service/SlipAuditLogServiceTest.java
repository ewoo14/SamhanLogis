package com.samhanair.logis.slip.audit.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.common.exception.ErrorCode;
import com.samhanair.logis.slip.audit.domain.SlipAuditLog;
import com.samhanair.logis.slip.audit.repository.SlipAuditLogRepository;
import com.samhanair.logis.slip.audit.service.SlipAuditLogService.ChangeEntry;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.realtime.SlipRealtimeBroker;
import com.samhanair.logis.slip.repository.SlipRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * PR-H2 BE — SlipAuditLogService 단위 테스트 (5 case).
 *
 * <ol>
 *   <li>recordOverlayPatch — 정상 INSERT + slip.revisionCount 증가 + broker.publish(slip:edit)</li>
 *   <li>recordOverlayPatch — slip 미존재 시 NOT_FOUND, broker 미호출</li>
 *   <li>recordBatch — 다중 changes 같은 revisionNo 공유 + 단일 SSE event</li>
 *   <li>recordBatch — 빈 changes 거부 (INVALID_INPUT)</li>
 *   <li>listBySlip — repository 위임</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
class SlipAuditLogServiceTest {

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
                UUID.randomUUID(), null, null, "거래처A",
                null, "원본 메모", "user-1");
    }

    @Test
    void recordOverlayPatch_slipExists_insertsAndPublishesAndIncrementsRevision() {
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(auditLogRepository.save(any(SlipAuditLog.class))).thenAnswer(inv -> {
            SlipAuditLog log = inv.getArgument(0);
            ReflectionTestUtils.setField(log, "id", UUID.randomUUID());
            return log;
        });

        SlipAuditLog saved = service.recordOverlayPatch(slipId, actorId, "홍길동", "#3B82F6",
                "memo", "원본 메모", "수정된 메모");

        assertThat(saved.getRevisionNo()).isEqualTo(1);
        assertThat(saved.getOldValue()).isEqualTo("원본 메모");
        assertThat(saved.getNewValue()).isEqualTo("수정된 메모");
        assertThat(slip.getRevisionCount()).isEqualTo(1);
        verify(broker, times(1))
                .publish(eq(slipId), eq(SlipAuditLogService.EVENT_SLIP_EDIT), any());
    }

    @Test
    void recordOverlayPatch_slipMissing_throwsNotFoundAndSkipsPublish() {
        when(slipRepository.findById(slipId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.recordOverlayPatch(slipId, actorId, "홍길동", null,
                "memo", "old", "new"))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.NOT_FOUND);

        verify(auditLogRepository, never()).save(any(SlipAuditLog.class));
        verify(broker, never()).publish(any(), any(), any());
    }

    @Test
    void recordBatch_multipleChanges_shareSameRevisionAndSingleSseEvent() {
        when(slipRepository.findById(slipId)).thenReturn(Optional.of(slip));
        when(auditLogRepository.save(any(SlipAuditLog.class))).thenAnswer(inv -> {
            SlipAuditLog log = inv.getArgument(0);
            ReflectionTestUtils.setField(log, "id", UUID.randomUUID());
            return log;
        });

        List<ChangeEntry> changes = List.of(
                new ChangeEntry("memo", "old-memo", "new-memo"),
                new ChangeEntry("shippingAddress", null, "서울시 강남구"));
        List<SlipAuditLog> saved = service.recordBatch(slipId, actorId, "홍길동", null, changes);

        assertThat(saved).hasSize(2);
        assertThat(saved).allMatch(s -> s.getRevisionNo() == 1);
        assertThat(slip.getRevisionCount()).isEqualTo(1);
        verify(broker, times(1))
                .publish(eq(slipId), eq(SlipAuditLogService.EVENT_SLIP_EDIT), any());
    }

    @Test
    void recordBatch_emptyChanges_throwsInvalidInput() {
        assertThatThrownBy(() -> service.recordBatch(slipId, actorId, "홍길동", null, List.of()))
                .isInstanceOf(BusinessException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_INPUT);

        verify(slipRepository, never()).findById(any());
        verify(broker, never()).publish(any(), any(), any());
    }

    @Test
    void listBySlip_delegatesToRepository() {
        when(auditLogRepository.findBySlipIdOrderByRevisionNoDescChangedAtDesc(slipId))
                .thenReturn(List.of());

        service.listBySlip(slipId);

        verify(auditLogRepository, times(1))
                .findBySlipIdOrderByRevisionNoDescChangedAtDesc(slipId);
    }
}
