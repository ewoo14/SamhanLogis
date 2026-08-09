package com.samhanair.logis.slip.revision.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.samhanair.logis.common.exception.BusinessException;
import com.samhanair.logis.slip.domain.Slip;
import com.samhanair.logis.slip.domain.SlipType;
import com.samhanair.logis.slip.revision.domain.SlipRevision;
import com.samhanair.logis.slip.revision.domain.SlipSnapshot;
import com.samhanair.logis.slip.revision.repository.SlipRevisionRepository;
import com.samhanair.logis.slip.service.closing.SlipClosedDateGuard;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.junit.jupiter.api.extension.ExtendWith;

@ExtendWith(MockitoExtension.class)
class SlipRevisionClosedDateGuardTest {

    @Mock private SlipRevisionRepository repository;
    @Mock private SlipClosedDateGuard closedDateGuard;
    @Mock private Slip slip;
    @Mock private SlipRevision revision;
    @Mock private SlipSnapshot snapshot;

    @Test
    void restore_checksTheTargetSnapshotDateBeforeApplyingIt() {
        UUID slipId = UUID.randomUUID();
        String actorId = UUID.randomUUID().toString();
        when(slip.getId()).thenReturn(slipId);
        when(slip.getSlipType()).thenReturn(SlipType.OUTBOUND);
        when(repository.findSnapshotRowBySlipIdAndRevisionNo(slipId, 1)).thenReturn(Optional.empty());
        when(repository.findBySlipIdAndRevisionNo(slipId, 1)).thenReturn(Optional.of(revision));
        when(revision.getSnapshot()).thenReturn(snapshot);
        when(snapshot.slipDate()).thenReturn(LocalDate.of(2026, 8, 7));
        org.mockito.Mockito.doThrow(new BusinessException(
                com.samhanair.logis.common.exception.ErrorCode.CONFLICT, "마감된 날짜입니다"))
                .when(closedDateGuard).assertAllowed(eq(SlipType.OUTBOUND),
                        eq(LocalDate.of(2026, 8, 7)), eq(actorId));

        SlipRevisionService service = new SlipRevisionService(repository, new ObjectMapper(), closedDateGuard);

        assertThatThrownBy(() -> service.restore(slip, 1, UUID.fromString(actorId), "관리자", null))
                .isInstanceOf(BusinessException.class)
                .hasMessage("마감된 날짜입니다");
        verify(slip, never()).restoreFromSnapshot(snapshot);
    }
}
