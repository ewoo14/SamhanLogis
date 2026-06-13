package com.samhanair.logis.groupware.service;

import com.samhanair.logis.groupware.domain.ApprovalNumberSequence;
import com.samhanair.logis.groupware.repository.ApprovalNumberSequenceRepository;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * 결재문서번호 채번 — KST 기준 {@code yyyy/MM/dd-N} 형식.
 *
 * <p>날짜별 sequence row 를 {@code PESSIMISTIC_WRITE} 로 잠가 동시 생성을 직렬화하고,
 * {@code approval_lines(approval_no)} active unique index 가 최종 중복 방어선이다.
 */
@Service
@RequiredArgsConstructor
public class ApprovalNumberService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy/MM/dd");

    private final ApprovalNumberSequenceRepository sequenceRepository;

    /** KST 오늘 날짜로 다음 결재문서번호를 채번한다. */
    @Transactional(propagation = Propagation.REQUIRED)
    public String next() {
        return next(LocalDate.now(KST));
    }

    /** 지정 날짜로 다음 결재문서번호를 채번한다. 테스트와 backfill 보정용이다. */
    @Transactional(propagation = Propagation.REQUIRED)
    public String next(LocalDate approvalDate) {
        ApprovalNumberSequence sequence = loadOrCreateLockedSequence(approvalDate);
        int seqNo = sequence.next();
        return approvalDate.format(DATE_FMT) + "-" + seqNo;
    }

    private ApprovalNumberSequence loadOrCreateLockedSequence(LocalDate approvalDate) {
        sequenceRepository.insertIfAbsent(UUID.randomUUID(), approvalDate);
        return sequenceRepository.findLockedByApprovalDate(approvalDate)
                .orElseThrow(() -> new IllegalStateException("결재문서번호 시퀀스 생성 실패"));
    }
}
