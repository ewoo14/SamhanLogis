package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.TaxInvoiceNumberSequence;
import com.samhanair.logis.accounting.repository.TaxInvoiceNumberSequenceRepository;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 세금계산서 발행번호 채번 — {@code yyyyMMdd-NNNN} 형식 (NNNN 4자리 zero-pad).
 *
 * <p>날짜별 sequence row 를 배타 잠금으로 확보한 뒤 증가시킨다. partial UNIQUE INDEX 는
 * 최종 백업이다.
 */
@Service
@RequiredArgsConstructor
public class TaxInvoiceNumberService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final TaxInvoiceNumberSequenceRepository sequenceRepository;

    /**
     * 다음 발행번호 채번 — 시퀀스 조회 → 없으면 새로 생성 → next() → {@code yyyyMMdd-NNNN} 포맷.
     *
     * @param issueDate 채번 기준 날짜 (보통 supplyDate)
     * @return {@code yyyyMMdd-NNNN} 형식 발행번호 (NNNN 4자리)
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public String next(LocalDate issueDate) {
        TaxInvoiceNumberSequence seq = loadOrCreateLockedSequence(issueDate);
        int seqNo = seq.next();
        return issueDate.format(DATE_FMT) + "-" + String.format("%04d", seqNo);
    }

    /**
     * 발행일별 세금계산서 번호 채번 row 를 배타 잠금으로 확보한다.
     *
     * <p>최초 row 생성은 {@code INSERT ... ON CONFLICT DO NOTHING} 으로 수렴시키고,
     * 잠금 조회한 row 에서만 {@link TaxInvoiceNumberSequence#next()} 를 호출한다.
     *
     * @param issueDate 채번 기준 발행일
     * @return 잠금이 확보된 세금계산서 번호 시퀀스 row
     */
    private TaxInvoiceNumberSequence loadOrCreateLockedSequence(LocalDate issueDate) {
        sequenceRepository.insertIfAbsent(UUID.randomUUID(), issueDate);
        return sequenceRepository.findLockedByIssueDate(issueDate)
                .orElseThrow(() -> new IllegalStateException("세금계산서 번호 시퀀스 생성 실패"));
    }
}
