package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.CashReceiptNumberSequence;
import com.samhanair.logis.accounting.repository.CashReceiptNumberSequenceRepository;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 입금보고서 번호 채번 — {@code yyyy/MM/dd-N} 형식. */
@Service
@RequiredArgsConstructor
public class CashReceiptNumberService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy/MM/dd");

    private final CashReceiptNumberSequenceRepository sequenceRepository;

    /** 다음 입금보고서 번호를 채번한다. */
    @Transactional(propagation = Propagation.REQUIRED)
    public String next(LocalDate receiptDate) {
        CashReceiptNumberSequence seq = loadOrCreateLockedSequence(receiptDate);
        return receiptDate.format(DATE_FMT) + "-" + seq.next();
    }

    private CashReceiptNumberSequence loadOrCreateLockedSequence(LocalDate receiptDate) {
        sequenceRepository.insertIfAbsent(UUID.randomUUID(), receiptDate);
        return sequenceRepository.findLockedByReceiptDate(receiptDate)
                .orElseThrow(() -> new IllegalStateException("입금보고서 번호 시퀀스 생성 실패"));
    }
}
