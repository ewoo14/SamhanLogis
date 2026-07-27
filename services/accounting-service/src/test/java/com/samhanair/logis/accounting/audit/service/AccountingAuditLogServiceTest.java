package com.samhanair.logis.accounting.audit.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.audit.domain.AccountingAuditLog;
import com.samhanair.logis.accounting.audit.repository.AccountingAuditLogRepository;
import com.samhanair.logis.shared.realtime.audit.ChangeEntry;
import com.samhanair.logis.shared.realtime.broker.RealtimeBroker;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * PR-H4b BE-A — AccountingAuditLogService 단위 테스트 (6 case).
 *
 * <ol>
 *   <li>recordOverlayPatch — 정상 INSERT + revisionNo 채번 + broker.publish(accounting:edit)</li>
 *   <li>recordOverlayPatch — null entityId 거부</li>
 *   <li>recordBatch — 다중 changes 같은 revisionNo 공유 + 단일 SSE event</li>
 *   <li>recordBatch — 빈 changes 거부</li>
 *   <li>listByEntity — repository 위임</li>
 *   <li>revision 채번 — 동일 entityId 의 연속 호출 시 단조 증가</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AccountingAuditLogServiceTest {

    @Mock private AccountingAuditLogRepository auditLogRepository;
    @Mock private RealtimeBroker broker;
    @Mock private EntityManager entityManager;
    @Mock private Query revisionLockQuery;

    @InjectMocks private AccountingAuditLogService service;

    private UUID entityId;
    private UUID actorId;

    @BeforeEach
    void setUp() {
        entityId = UUID.randomUUID();
        actorId = UUID.randomUUID();
        when(entityManager.createNativeQuery(any(String.class))).thenReturn(revisionLockQuery);
        when(revisionLockQuery.setParameter(eq(1), any(String.class))).thenReturn(revisionLockQuery);
        when(revisionLockQuery.getSingleResult()).thenReturn(0);
        when(auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(entityId))
                .thenReturn(List.of());
    }

    @Test
    void recordOverlayPatch_inserts_publishes_andAssignsRevisionNo() {
        when(auditLogRepository.save(any(AccountingAuditLog.class))).thenAnswer(inv -> {
            AccountingAuditLog log = inv.getArgument(0);
            ReflectionTestUtils.setField(log, "id", UUID.randomUUID());
            return log;
        });

        service.recordOverlayPatch(entityId, actorId, "이수민", "#3B82F6",
                "taxInvoice.partnerName", "(주)구상호", "(주)신상호");

        verify(broker, times(1))
                .publish(eq(entityId), eq(AccountingAuditLogService.EVENT_ACCOUNTING_EDIT), any());
    }

    @Test
    void recordOverlayPatch_rejects_null_entityId() {
        assertThatThrownBy(() -> service.recordOverlayPatch(null, actorId, "이수민", null,
                "field", "old", "new"))
                .isInstanceOf(NullPointerException.class);
    }

    @Test
    void recordBatch_sharesRevisionNo_andEmitsSingleEvent() {
        when(auditLogRepository.save(any(AccountingAuditLog.class))).thenAnswer(inv -> {
            AccountingAuditLog log = inv.getArgument(0);
            ReflectionTestUtils.setField(log, "id", UUID.randomUUID());
            return log;
        });

        List<ChangeEntry> changes = List.of(
                new ChangeEntry("taxInvoice.partnerName", "old1", "new1"),
                new ChangeEntry("taxInvoice.description", "old2", "new2"));
        List<AccountingAuditLog> saved = service.recordBatch(entityId, actorId, "이수민", null, changes);

        assertThat(saved).hasSize(2);
        assertThat(saved.get(0).getRevisionNo()).isEqualTo(saved.get(1).getRevisionNo());
        // #810 R3-CODEX (S4-M2): 한 작업(batch)의 행들은 changed_at 도 단일 timestamp 를
        // 공유한다 — 행마다 now() 재호출로 시각이 갈라지면 회차 그룹핑/정렬이 부정확해진다.
        assertThat(saved.get(0).getChangedAt())
                .isNotNull()
                .isEqualTo(saved.get(1).getChangedAt());
        verify(broker, times(1))
                .publish(eq(entityId), eq(AccountingAuditLogService.EVENT_ACCOUNTING_EDIT), any());
    }

    @Test
    void recordBatch_rejectsEmptyChanges() {
        assertThatThrownBy(() -> service.recordBatch(entityId, actorId, "이수민", null, List.of()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void listByEntity_delegatesToRepository() {
        service.listByEntity(entityId);
        verify(auditLogRepository, times(1))
                .findByEntityIdOrderByRevisionNoDescChangedAtDesc(entityId);
    }

    @Test
    void revisionNo_isMonotonicIncreasing_acrossCalls() {
        List<AccountingAuditLog> persisted = new ArrayList<>();
        when(auditLogRepository.findByEntityIdOrderByRevisionNoDescChangedAtDesc(entityId))
                .thenAnswer(inv -> List.copyOf(persisted));
        when(auditLogRepository.save(any(AccountingAuditLog.class))).thenAnswer(inv -> {
            AccountingAuditLog log = inv.getArgument(0);
            ReflectionTestUtils.setField(log, "id", UUID.randomUUID());
            persisted.add(log);
            return log;
        });

        service.recordOverlayPatch(entityId, actorId, "이수민", null, "field1", null, "v1");
        service.recordOverlayPatch(entityId, actorId, "이수민", null, "field2", null, "v2");
        service.recordOverlayPatch(entityId, actorId, "이수민", null, "field3", null, "v3");

        assertThat(persisted).extracting(AccountingAuditLog::getRevisionNo)
                .containsExactly(1, 2, 3);
        verify(broker, times(3))
                .publish(eq(entityId), eq(AccountingAuditLogService.EVENT_ACCOUNTING_EDIT), any());
        verify(entityManager, times(3)).createNativeQuery(contains("pg_advisory_xact_lock"));
    }
}
