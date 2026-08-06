package com.samhanair.logis.accounting.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.samhanair.logis.accounting.repository.TaxInvoiceBatchRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class LedgerSnapshotBatchNoGeneratorTest {
    @Mock private TaxInvoiceBatchRepository batchRepository;
    @Mock private EntityManager entityManager;
    @Mock private Query query;

    @Test
    void usesLockedDateNamespaceAndDoesNotReuseSoftDeletedSuffix() {
        when(entityManager.createNativeQuery(anyString())).thenReturn(query);
        when(query.setParameter(anyString(), anyString())).thenReturn(query);
        when(query.getSingleResult()).thenReturn(0L);
        when(batchRepository.findMaxSequenceByBatchNoPrefixIncludingDeleted("LED-20260804-"))
                .thenReturn(41);

        String batchNo = new LedgerSnapshotBatchNoGenerator(batchRepository, entityManager)
                .next(LocalDate.of(2026, 8, 4));

        assertThat(batchNo).isEqualTo("LED-20260804-000042");
        verify(entityManager).createNativeQuery(
                "SELECT pg_advisory_xact_lock(CAST(hashtext(:lockKey) AS bigint))");
        verify(query).setParameter("lockKey", "partner_ledger_snapshot_seq_20260804");
    }
}
