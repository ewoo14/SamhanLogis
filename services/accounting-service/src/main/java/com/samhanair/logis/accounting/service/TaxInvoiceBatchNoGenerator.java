package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.repository.TaxInvoiceBatchRepository;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/** 세금계산서 일괄 업로드 배치 번호 채번기. */
@Service
@RequiredArgsConstructor
public class TaxInvoiceBatchNoGenerator {

    private static final DateTimeFormatter BATCH_MONTH = DateTimeFormatter.ofPattern("yyyyMM");

    private final TaxInvoiceBatchRepository batchRepository;
    private final EntityManager entityManager;

    /**
     * 배치 번호 채번 — {@code TIB-yyyyMM-NNN} 형식.
     *
     * <p>월별 advisory lock 으로 채번 구간을 직렬화한 뒤, soft-delete/gap 상태에서도
     * 기존 번호와 충돌하지 않도록 활성 배치의 최대 숫자 suffix 에 1을 더한다.
     *
     * @param baseDate 채번 기준 날짜
     * @return 사용자 노출 배치 번호
     */
    public String next(LocalDate baseDate) {
        String ym = baseDate.format(BATCH_MONTH);
        String prefix = "TIB-" + ym + "-";
        lockMonth(ym);
        int nextSeq = batchRepository.findMaxSequenceByBatchNoPrefix(prefix) + 1;
        return prefix + String.format("%03d", nextSeq);
    }

    /**
     * PostgreSQL transaction advisory lock 으로 월별 채번 구간을 직렬화한다.
     *
     * @param ym {@code yyyyMM} 월 키
     */
    private void lockMonth(String ym) {
        entityManager.createNativeQuery("SELECT pg_advisory_xact_lock(CAST(hashtext(:lockKey) AS bigint))")
                .setParameter("lockKey", "tax_invoice_batch_seq_" + ym)
                .getSingleResult();
    }
}
