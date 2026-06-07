package com.samhanair.logis.accounting.service;

import com.samhanair.logis.accounting.domain.JournalNumberSequence;
import com.samhanair.logis.accounting.repository.JournalNumberSequenceRepository;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 분개번호 채번 — {@code yyyyMMdd-N} 형식. 날짜별 {@link JournalNumberSequence} 시퀀스를
 * 트랜잭션 안에서 조회/생성/증가시키고 {@code yyyyMMdd-N} 문자열로 포맷한다.
 *
 * <p>날짜별 sequence row 를 배타 잠금으로 확보한 뒤 증가시킨다. partial UNIQUE INDEX 는
 * 최종 백업이다.
 */
@Service
@RequiredArgsConstructor
public class JournalNumberService {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final JournalNumberSequenceRepository sequenceRepository;

    /**
     * 다음 분개번호 채번 — 시퀀스 조회 → 없으면 새로 생성 → next() → {@code yyyyMMdd-N} 포맷.
     *
     * @param journalDate 채번 기준 날짜
     * @return {@code yyyyMMdd-N} 형식 분개번호 (N 은 1, 2, 3, ... 자릿수 가변)
     */
    @Transactional(propagation = Propagation.REQUIRED)
    public String next(LocalDate journalDate) {
        JournalNumberSequence seq = loadOrCreateLockedSequence(journalDate);
        int seqNo = seq.next();
        return journalDate.format(DATE_FMT) + "-" + seqNo;
    }

    /**
     * 일자별 분개번호 채번 row 를 배타 잠금으로 확보한다.
     *
     * <p>최초 row 생성은 {@code INSERT ... ON CONFLICT DO NOTHING} 으로 수렴시키고,
     * 잠금 조회한 row 에서만 {@link JournalNumberSequence#next()} 를 호출한다.
     *
     * @param journalDate 채번 기준 날짜
     * @return 잠금이 확보된 분개번호 시퀀스 row
     */
    private JournalNumberSequence loadOrCreateLockedSequence(LocalDate journalDate) {
        sequenceRepository.insertIfAbsent(UUID.randomUUID(), journalDate);
        return sequenceRepository.findLockedByJournalDate(journalDate)
                .orElseThrow(() -> new IllegalStateException("분개번호 시퀀스 생성 실패"));
    }
}
