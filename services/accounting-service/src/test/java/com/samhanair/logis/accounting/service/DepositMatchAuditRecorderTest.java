package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.samhanair.logis.accounting.audit.domain.AccountingAuditLog;
import com.samhanair.logis.accounting.audit.repository.AccountingAuditLogRepository;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class DepositMatchAuditRecorderTest {

    @Mock
    private AccountingAuditLogRepository auditLogRepository;

    @InjectMocks
    private DepositMatchAuditRecorder recorder;

    @Test
    void uuid_actor_is_not_persisted_as_actor_name_prefix() {
        UUID actorId = UUID.fromString("123e4567-e89b-12d3-a456-426614174000");

        recorder.recordFetchAndMatch(actorId, "DRY_RUN", 3, 2, 1);

        ArgumentCaptor<AccountingAuditLog> captor = ArgumentCaptor.forClass(AccountingAuditLog.class);
        verify(auditLogRepository, times(2)).save(captor.capture());
        assertThat(captor.getAllValues())
                .allSatisfy(log -> {
                    assertThat(log.getActorId()).isEqualTo(actorId);
                    assertThat(log.getActorName()).isEqualTo("변경자 미상");
                });
    }
}
