package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.repository.TaxInvoiceBatchRepository;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** 거래처 원장 저장 snapshot 전용 배치 번호 채번기. */
@Service
@RequiredArgsConstructor
public class LedgerSnapshotBatchNoGenerator {
    private static final DateTimeFormatter DATE = DateTimeFormatter.BASIC_ISO_DATE;

    private final TaxInvoiceBatchRepository batchRepository;
    private final EntityManager entityManager;

    /** LED-yyyyMMdd-NNNNNN 형식으로 soft-delete 이력을 포함해 번호를 증가시킨다. */
    public String next(LocalDate baseDate) {
        String date = baseDate.format(DATE);
        String prefix = "LED-" + date + "-";
        lockDate(date);
        int next = batchRepository.findMaxSequenceByBatchNoPrefixIncludingDeleted(prefix) + 1;
        return prefix + String.format("%06d", next);
    }

    private void lockDate(String date) {
        entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(CAST(hashtext(:lockKey) AS bigint))")
                .setParameter("lockKey", "partner_ledger_snapshot_seq_" + date)
                .getSingleResult();
    }
}
