package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.SalesCommissionSettlementNumberSequence;
import com.samhanair.logis.accounting.repository.SalesCommissionSettlementNumberSequenceRepository;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/** 영업수수료 정산서 문서번호 채번 — 저장소 표준 {@code yyyy/MM/dd-N}. */
@Service
@RequiredArgsConstructor
public class SalesCommissionSettlementNumberService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy/MM/dd");

    private final SalesCommissionSettlementNumberSequenceRepository sequenceRepository;

    /** 정산 기준일별 row lock으로 다음 정산서 문서번호를 발급한다. */
    @Transactional(propagation = Propagation.REQUIRED)
    public String next(LocalDate settlementDate) {
        if (settlementDate == null) {
            throw new IllegalArgumentException("settlementDate 는 필수입니다");
        }
        SalesCommissionSettlementNumberSequence sequence = loadOrCreateLockedSequence(settlementDate);
        return settlementDate.format(DATE_FMT) + "-" + sequence.next();
    }

    private SalesCommissionSettlementNumberSequence loadOrCreateLockedSequence(LocalDate settlementDate) {
        sequenceRepository.insertIfAbsent(UUID.randomUUID(), settlementDate);
        return sequenceRepository.findLockedBySettlementDate(settlementDate)
                .orElseThrow(() -> new IllegalStateException("영업수수료 정산서 번호 시퀀스 생성 실패"));
    }
}
